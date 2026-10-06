import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import db from '../db/firestore.js';

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
    headers: { Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}
function validRazorpaySignature(orderId, paymentId, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function walletForUser(userId) {
  let wallet = await db.findOneBy('wallets', 'user_id', Number(userId));
  if (!wallet) wallet = await db.create('wallets', { user_id: Number(userId), balance: 0, coins: 25 });
  return wallet;
}

export const getWallet = async (req, res) => {
  try {
    const wallet = await walletForUser(req.user.id);
    const transactions = await db.where('transactions', 'wallet_id', Number(wallet.id));
    return res.json({ wallet: {
      ...wallet,
      balance: Number(wallet.balance),
      coins: Number(wallet.coins),
      stats: {
        total_spent: transactions.filter((t) => t.type === 'debit').reduce((sum, t) => sum + Number(t.amount || 0), 0),
        total_added: transactions.filter((t) => t.type === 'credit').reduce((sum, t) => sum + Number(t.amount || 0), 0),
        total_transactions: transactions.length,
      },
    } });
  } catch (err) {
    console.error('Get wallet error:', err);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
};

export const createRazorpayOrder = async (req, res) => {
  try {
    const credentials = razorpayCredentials();
    if (!credentials) return res.status(503).json({ error: 'Razorpay payments are not configured on this server' });
    const amount = Number(req.body.amount);
    const amountPaise = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount < 10 || amount > 100000 || Math.abs(amount * 100 - amountPaise) > 1e-6) return res.status(400).json({ error: 'Enter an amount between ₹10 and ₹100,000, with up to 2 decimal places' });
    const userId = req.user.id;
    await walletForUser(userId);
    const orderResult = await razorpayRequest('/orders', { method: 'POST', body: { amount: amountPaise, currency: 'INR', receipt: `w-${randomUUID()}`, notes: { user_id: String(userId), purpose: 'wallet_topup' } } });
    if (!orderResult.ok || !orderResult.data.id) {
      console.error('Razorpay order creation failed:', orderResult.status, orderResult.data.error?.description || 'Unknown error');
      return res.status(502).json({ error: 'Could not start the Razorpay payment. Please try again.' });
    }
    await db.collection('wallet_payment_orders').doc(orderResult.data.id).set({ id: orderResult.data.id, user_id: Number(userId), razorpay_order_id: orderResult.data.id, amount_paise: amountPaise, status: 'created', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return res.json({ keyId: credentials.keyId, orderId: orderResult.data.id, amount: orderResult.data.amount, currency: orderResult.data.currency });
  } catch (err) {
    console.error('Razorpay order error:', err);
    return res.status(500).json({ error: 'Failed to start Razorpay payment' });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  try {
    const credentials = razorpayCredentials();
    if (!credentials) return res.status(503).json({ error: 'Razorpay payments are not configured on this server' });
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!/^order_[A-Za-z0-9]+$/.test(orderId || '') || !/^pay_[A-Za-z0-9]+$/.test(paymentId || '') || !signature) return res.status(400).json({ error: 'Invalid Razorpay payment details' });
    const orderRef = db.collection('wallet_payment_orders').doc(orderId);
    const storedOrderSnap = await orderRef.get();
    if (!storedOrderSnap.exists || Number(storedOrderSnap.data().user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Payment order was not found for this account' });
    const storedOrder = storedOrderSnap.data();
    if (!validRazorpaySignature(orderId, paymentId, signature, credentials.keySecret)) return res.status(400).json({ error: 'Razorpay payment signature could not be verified' });
    if (storedOrder.status === 'paid') {
      if (storedOrder.payment_id !== paymentId) return res.status(409).json({ error: 'This order has already been credited' });
      return res.json({ message: 'Payment already credited', alreadyProcessed: true });
    }
    const paymentResult = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (!paymentResult.ok) return res.status(502).json({ error: 'Could not confirm payment status with Razorpay' });
    let payment = paymentResult.data;
    if (payment.order_id !== orderId || Number(payment.amount) !== Number(storedOrder.amount_paise) || payment.currency !== 'INR') return res.status(400).json({ error: 'Payment does not match the wallet order' });
    if (payment.status === 'authorized') {
      const capture = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, { method: 'POST', body: { amount: Number(storedOrder.amount_paise), currency: 'INR' } });
      if (capture.ok) payment = capture.data;
      else {
        const refreshed = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
        if (refreshed.ok) payment = refreshed.data;
      }
    }
    if (payment.status !== 'captured') return res.status(409).json({ error: 'Razorpay has not captured this payment yet' });

    const amount = Number(storedOrder.amount_paise) / 100;
    const bonusCoins = amount >= 2999 ? Math.round(amount * 0.30) : amount >= 500 ? Math.round(amount * 0.05) : 0;
    const wallet = await walletForUser(req.user.id);
    const store = db.store();
    const walletRef = db.collection('wallets').doc(String(wallet.id));
    const paymentRef = db.collection('razorpay_payments').doc(paymentId);
    const transactionRef = db.collection('transactions').doc();
    const notificationRef = db.collection('notifications').doc();
    const result = await store.runTransaction(async (transaction) => {
      const [freshOrderSnap, freshWalletSnap, paymentSnap] = await Promise.all([transaction.get(orderRef), transaction.get(walletRef), transaction.get(paymentRef)]);
      if (paymentSnap.exists) {
        const priorPayment = paymentSnap.data();
        return priorPayment.order_id === orderId && Number(priorPayment.user_id) === Number(req.user.id)
          ? { alreadyProcessed: true }
          : { conflict: true };
      }
      if (!freshOrderSnap.exists || freshOrderSnap.data().status !== 'created' || Number(freshOrderSnap.data().user_id) !== Number(req.user.id)) return { conflict: true };
      const freshWallet = freshWalletSnap.data();
      const balance = Number(freshWallet.balance || 0) + amount;
      const coins = Number(freshWallet.coins || 0) + bonusCoins;
      transaction.set(orderRef, { ...freshOrderSnap.data(), status: 'paid', payment_id: paymentId, updated_at: new Date().toISOString() });
      transaction.set(paymentRef, { order_id: orderId, payment_id: paymentId, user_id: Number(req.user.id), created_at: new Date().toISOString() });
      transaction.set(walletRef, { balance, coins, updated_at: new Date().toISOString() }, { merge: true });
      transaction.set(transactionRef, {
        id: transactionRef.id,
        wallet_id: wallet.id,
        type: 'credit',
        amount,
        payment_method: 'Razorpay',
        razorpay_method: payment.method || null,
        payment_status: payment.status,
        payment_id: paymentId,
        razorpay_order_id: orderId,
        description: 'Wallet Topup via Razorpay',
        reference_id: paymentId,
        created_at: new Date().toISOString(),
      });
      transaction.set(notificationRef, { id: notificationRef.id, user_id: Number(req.user.id), title: 'Credits Added Successfully 💰', message: `₹${amount.toFixed(2)} added to your wallet via Razorpay.`, type: 'wallet', is_read: false, created_at: new Date().toISOString() });
      return { balance, coins };
    });
    if (result.alreadyProcessed) return res.json({ message: 'Payment already credited', alreadyProcessed: true });
    if (result.conflict) return res.status(409).json({ error: 'Payment could not be credited to the wallet' });
    return res.json({ message: 'Wallet top-up successful', balance: result.balance, coins: result.coins, bonusCoins, referenceId: paymentId });
  } catch (err) {
    console.error('Razorpay verification error:', err);
    return res.status(500).json({ error: 'Failed to verify Razorpay payment' });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const wallet = await db.findOneBy('wallets', 'user_id', Number(req.user.id));
    if (!wallet) return res.json({ transactions: [], groups: [] });
    const transactions = await db.where('transactions', 'wallet_id', Number(wallet.id));
    transactions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return res.json({ transactions: transactions.slice(0, 50).map((item) => ({ ...item, amount: Number(item.amount) })) });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return res.status(500).json({ error: 'Failed to retrieve transactions' });
  }
};
