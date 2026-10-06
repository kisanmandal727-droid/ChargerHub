import db from '../db/index.js';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function razorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const credentials = razorpayCredentials();
  if (!credentials) throw new Error('Razorpay is not configured');

  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function validRazorpaySignature(orderId, paymentId, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const getWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    let walletRes = await db.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
    if (walletRes.rows.length === 0) {
      walletRes = await db.query(
        'INSERT INTO wallets (user_id, balance, coins) VALUES ($1, 0.00, 25) RETURNING *',
        [userId]
      );
    }

    const wallet = walletRes.rows[0];

    // Summary stats
    const statsRes = await db.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_added,
        COUNT(*) as total_transactions
       FROM transactions 
       WHERE wallet_id = $1`,
      [wallet.id]
    );

    return res.json({
      wallet: {
        ...wallet,
        balance: parseFloat(wallet.balance),
        coins: parseInt(wallet.coins, 10),
        stats: statsRes.rows[0]
      }
    });
  } catch (err) {
    console.error('Get wallet error:', err);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
};

export const createRazorpayOrder = async (req, res) => {
  try {
    const credentials = razorpayCredentials();
    if (!credentials) {
      return res.status(503).json({ error: 'Razorpay payments are not configured on this server' });
    }

    const amount = Number(req.body.amount);
    const amountPaise = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount < 10 || amount > 100000 || Math.abs(amount * 100 - amountPaise) > 1e-6) {
      return res.status(400).json({ error: 'Enter an amount between ₹10 and ₹100,000, with up to 2 decimal places' });
    }

    const userId = req.user.id;
    await db.query(
      'INSERT INTO wallets (user_id, balance, coins) VALUES ($1, 0.00, 0) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );

    const receipt = `w-${randomUUID()}`;
    const orderResult = await razorpayRequest('/orders', {
      method: 'POST',
      body: {
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { user_id: String(userId), purpose: 'wallet_topup' },
      },
    });
    if (!orderResult.ok || !orderResult.data.id) {
      console.error('Razorpay order creation failed:', orderResult.status, orderResult.data.error?.description || 'Unknown error');
      return res.status(502).json({ error: 'Could not start the Razorpay payment. Please try again.' });
    }

    await db.query(
      `INSERT INTO wallet_payment_orders (user_id, razorpay_order_id, amount_paise, status)
       VALUES ($1, $2, $3, 'created')`,
      [userId, orderResult.data.id, amountPaise]
    );

    return res.json({
      keyId: credentials.keyId,
      orderId: orderResult.data.id,
      amount: orderResult.data.amount,
      currency: orderResult.data.currency,
    });
  } catch (err) {
    console.error('Razorpay order error:', err);
    return res.status(500).json({ error: 'Failed to start Razorpay payment' });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  try {
    const credentials = razorpayCredentials();
    if (!credentials) {
      return res.status(503).json({ error: 'Razorpay payments are not configured on this server' });
    }

    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!/^order_[A-Za-z0-9]+$/.test(orderId || '') || !/^pay_[A-Za-z0-9]+$/.test(paymentId || '') || !signature) {
      return res.status(400).json({ error: 'Invalid Razorpay payment details' });
    }

    const orderResult = await db.query(
      `SELECT amount_paise, status, payment_id FROM wallet_payment_orders
       WHERE razorpay_order_id = $1 AND user_id = $2`,
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment order was not found for this account' });
    }
    const storedOrder = orderResult.rows[0];

    if (!validRazorpaySignature(orderId, paymentId, signature, credentials.keySecret)) {
      return res.status(400).json({ error: 'Razorpay payment signature could not be verified' });
    }

    if (storedOrder.status === 'paid') {
      if (storedOrder.payment_id !== paymentId) {
        return res.status(409).json({ error: 'This order has already been credited' });
      }
      return res.json({ message: 'Payment already credited', alreadyProcessed: true });
    }

    const paymentResult = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (!paymentResult.ok) {
      console.error('Razorpay payment lookup failed:', paymentResult.status, paymentResult.data.error?.description || 'Unknown error');
      return res.status(502).json({ error: 'Could not confirm payment status with Razorpay' });
    }

    let payment = paymentResult.data;
    if (
      payment.order_id !== orderId ||
      Number(payment.amount) !== Number(storedOrder.amount_paise) ||
      payment.currency !== 'INR'
    ) {
      return res.status(400).json({ error: 'Payment does not match the wallet order' });
    }

    if (payment.status === 'authorized') {
      const captureResult = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: 'POST',
        body: { amount: Number(storedOrder.amount_paise), currency: 'INR' },
      });
      if (captureResult.ok) {
        payment = captureResult.data;
      } else {
        const refreshedPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
        if (refreshedPayment.ok) payment = refreshedPayment.data;
      }
    }

    if (payment.status !== 'captured') {
      return res.status(409).json({ error: 'Razorpay has not captured this payment yet' });
    }

    const amount = Number(storedOrder.amount_paise) / 100;
    const bonusCoins = amount >= 2999 ? Math.round(amount * 0.30) : amount >= 500 ? Math.round(amount * 0.05) : 0;
    const creditResult = await db.query(
      `WITH paid_order AS (
         UPDATE wallet_payment_orders
         SET status = 'paid', payment_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE razorpay_order_id = $2 AND user_id = $3 AND status = 'created'
         RETURNING user_id, amount_paise
       ), wallet_updated AS (
         UPDATE wallets w
         SET balance = w.balance + (paid_order.amount_paise::numeric / 100),
             coins = w.coins + $4,
             updated_at = CURRENT_TIMESTAMP
         FROM paid_order
         WHERE w.user_id = paid_order.user_id
         RETURNING w.balance, w.coins, paid_order.amount_paise
       ), transaction_insert AS (
         INSERT INTO transactions (wallet_id, type, amount, payment_method, description, reference_id)
         SELECT w.id, 'credit', wallet_updated.amount_paise::numeric / 100,
                'Razorpay', 'Wallet Topup via Razorpay', $1
         FROM wallet_updated
         JOIN wallets w ON w.user_id = $3
         RETURNING id
       ), notification_insert AS (
         INSERT INTO notifications (user_id, title, message, type)
         SELECT $3, 'Credits Added Successfully 💰',
                '₹' || TO_CHAR(wallet_updated.amount_paise::numeric / 100, 'FM999999990.00') ||
                ' added to your wallet via Razorpay.', 'wallet'
         FROM wallet_updated
         RETURNING id
       )
       SELECT balance, coins, amount_paise FROM wallet_updated`,
      [paymentId, orderId, req.user.id, bonusCoins]
    );

    if (creditResult.rows.length === 0) {
      const alreadyCredited = await db.query(
        `SELECT 1 FROM wallet_payment_orders
         WHERE razorpay_order_id = $1 AND user_id = $2 AND status = 'paid' AND payment_id = $3`,
        [orderId, req.user.id, paymentId]
      );
      if (alreadyCredited.rows.length > 0) {
        return res.json({ message: 'Payment already credited', alreadyProcessed: true });
      }
      return res.status(409).json({ error: 'Payment could not be credited to the wallet' });
    }

    return res.json({
      message: 'Wallet top-up successful',
      balance: Number(creditResult.rows[0].balance),
      coins: Number(creditResult.rows[0].coins),
      bonusCoins,
      referenceId: paymentId,
    });
  } catch (err) {
    console.error('Razorpay verification error:', err);
    return res.status(500).json({ error: 'Failed to verify Razorpay payment' });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const walletRes = await db.query('SELECT id FROM wallets WHERE user_id = $1', [userId]);
    if (walletRes.rows.length === 0) {
      return res.json({ transactions: [], groups: [] });
    }

    const walletId = walletRes.rows[0].id;
    const txnRes = await db.query(
      `SELECT * FROM transactions 
       WHERE wallet_id = $1 
       ORDER BY created_at DESC LIMIT 50`,
      [walletId]
    );

    const txns = txnRes.rows.map(t => ({
      ...t,
      amount: parseFloat(t.amount)
    }));

    return res.json({ transactions: txns });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
};
