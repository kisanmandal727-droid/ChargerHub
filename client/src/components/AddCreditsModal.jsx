import React, { useState } from 'react';
import { X, CheckCircle, ShieldCheck, Zap } from 'lucide-react';
import { useWallet } from '../context/WalletContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

let razorpayScriptPromise;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

export default function AddCreditsModal({ isOpen, onClose }) {
  const { createRazorpayOrder, verifyRazorpayPayment } = useWallet();
  const { user } = useAuth();
  const [amount, setAmount] = useState('500');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const presets = [
    { value: '100', label: '₹100' },
    { value: '200', label: '₹200' },
    { value: '500', label: '₹500', popular: true },
    { value: '1000', label: '₹1000' },
    { value: '2999', label: '₹2999', bonus: '+30% Coins' },
  ];

  if (!isOpen) return null;

  // ─── Pay via Razorpay ───────────────────────────────────────────────────────
  const handleRazorpayPayment = async () => {
    const val = Number(amount);
    if (!Number.isFinite(val) || val < 10 || val > 100000 || Math.abs(val * 100 - Math.round(val * 100)) > 1e-6) {
      setErrorMsg('Enter an amount between ₹10 and ₹100,000, with up to 2 decimal places');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load Razorpay Checkout. Check your connection and try again.');

      const order = await createRazorpayOrder(val);
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'ChargerHub',
        description: `Wallet Recharge — ₹${val.toFixed(2)}`,
        order_id: order.orderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: { color: '#00C896' },
        handler: async (response) => {
          try {
            const result = await verifyRazorpayPayment(response);
            setSuccessMsg(`₹${val.toFixed(2)} added successfully!${result.bonusCoins ? ` +${result.bonusCoins} bonus ChargerHub Coins 🎉` : ''}`);
            setTimeout(() => {
              setSuccessMsg('');
              onClose();
            }, 2000);
          } catch (err) {
            setErrorMsg(err.message || 'Payment could not be verified. Please contact support if your account was charged.');
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });
      checkout.on('payment.failed', (response) => {
        setErrorMsg(response.error?.description || 'Payment failed. Please try again.');
        setSubmitting(false);
      });
      checkout.open();
    } catch (err) {
      setErrorMsg(err.message || 'Could not start Razorpay payment. Please try again.');
      setSubmitting(false);
    }
  };

  const CH_GREEN = '#00C896';
  const NAV = '#0F1B2D';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '82vh' }}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#E0FBF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={18} color={CH_GREEN} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: NAV }}>Add Credits</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#556070' }}>Instant recharge for high-speed charging</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} color={NAV} />
          </button>
        </div>

        {successMsg ? (
          <div style={{ textAlign: 'center', padding: '32px 10px' }}>
            <CheckCircle size={56} color={CH_GREEN} style={{ margin: '0 auto 14px' }} />
            <h4 style={{ fontSize: '18px', fontWeight: 900, color: NAV, marginBottom: '8px' }}>Recharge Successful!</h4>
            <p style={{ fontSize: '14px', color: CH_GREEN, fontWeight: 700 }}>{successMsg}</p>
          </div>
        ) : (
          <>
            {/* Amount Presets */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#556070', display: 'block', marginBottom: '10px', letterSpacing: '0.5px' }}>
                SELECT AMOUNT
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                {presets.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setAmount(p.value)}
                    style={{
                      padding: '10px 4px',
                      borderRadius: '14px',
                      border: amount === p.value ? `2px solid ${CH_GREEN}` : '1.5px solid #E2E8F0',
                      background: amount === p.value ? '#E0FBF4' : '#FFFFFF',
                      color: amount === p.value ? '#007A5C' : NAV,
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.15s'
                    }}
                  >
                    {p.label}
                    {p.popular && (
                      <span style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: CH_GREEN, color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                        POPULAR
                      </span>
                    )}
                    {p.bonus && (
                      <span style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: '#6366F1', color: 'white', fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                        {p.bonus}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount */}
            <div className="input-group" style={{ marginBottom: '24px' }}>
              <span className="floating-label">CUSTOM AMOUNT (₹)</span>
              <input
                type="number"
                min="10"
                max="100000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field"
                placeholder="e.g. 750"
              />
            </div>

            {/* Payment Note */}
            <div style={{ background: '#F4F7FA', borderRadius: '14px', padding: '12px 14px', marginBottom: '18px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <ShieldCheck size={18} color={CH_GREEN} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: NAV, marginBottom: '2px' }}>Secured by Razorpay</div>
                <div style={{ fontSize: '11px', color: '#556070' }}>
                  UPI, cards, net banking and wallets. Credits are added after server verification.
                </div>
              </div>
            </div>

            {/* Razorpay logo row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {['UPI', 'GPay', 'PhonePe', 'Paytm', 'Visa', 'MC'].map((m) => (
                <span key={m} style={{ background: '#F4F7FA', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: '#556070' }}>
                  {m}
                </span>
              ))}
            </div>

            {errorMsg && (
              <p style={{ color: '#EF4444', fontSize: '13px', fontWeight: 600, marginBottom: '12px', textAlign: 'center' }}>
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              onClick={handleRazorpayPayment}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Opening Payment...' : `Pay ₹${amount} via Razorpay`}
            </button>

          </>
        )}
      </div>
    </div>
  );
}
