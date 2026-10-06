import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ArrowRightLeft, Zap, ChevronRight, X } from 'lucide-react';
import { useWallet } from '../../context/WalletContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import AddCreditsModal from '../../components/AddCreditsModal.jsx';

const CH_GREEN = '#00C896';
const NAV = '#0F1B2D';
const NAV_LIGHT = '#1A2E44';

export default function WalletView() {
  const { user } = useAuth();
  const { wallet, transactions, showTopupModal, setShowTopupModal } = useWallet();
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const formatDate = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return 'Recent'; }
  };

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
        + ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return ''; }
  };

  const formatFullDateTime = (isoString) => {
    const date = new Date(isoString);
    if (!isoString || Number.isNaN(date.getTime())) return 'Date unavailable';
    return date.toLocaleString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const groupedTxns = transactions.reduce((acc, txn) => {
    const dateKey = formatDate(txn.created_at);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(txn);
    return acc;
  }, {});

  const selectedIsDebit = selectedTransaction?.type === 'debit';
  const paymentStatus = String(selectedTransaction?.status || selectedTransaction?.payment_status || '').toLowerCase();
  const transactionDetails = selectedTransaction ? [
    ['Status', ['captured', 'paid', 'success', 'successful', 'completed'].includes(paymentStatus) ? 'Completed' : (paymentStatus || 'Completed')],
    ['Type', selectedIsDebit ? 'Wallet debit' : 'Wallet credit'],
    ['Description', selectedTransaction.description || selectedTransaction.station_name || 'Wallet transaction'],
    ['Payment method', selectedTransaction.payment_method || 'ChargerHub Wallet'],
    ...(selectedTransaction.razorpay_method ? [['Payment instrument', String(selectedTransaction.razorpay_method).toUpperCase()]] : []),
    ['Payment ID', selectedTransaction.payment_id || selectedTransaction.reference_id || 'Not provided'],
    ['Order ID', selectedTransaction.razorpay_order_id || selectedTransaction.order_id || 'Not provided'],
    ['Transaction ID', String(selectedTransaction.id || 'Not provided')],
    ...(selectedTransaction.station_name ? [['Station', selectedTransaction.station_name]] : []),
    ['Date and time', formatFullDateTime(selectedTransaction.created_at)],
  ] : [];

  return (
    <div className="wallet-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F4F7FA', minWidth: 0 }}>

      {/* ── Dark Header ── */}
      <div className="wallet-header" style={{
        background: `linear-gradient(160deg, ${NAV} 0%, ${NAV_LIGHT} 100%)`,
        color: '#FFFFFF',
        padding: '16px 20px 18px',
        borderBottomLeftRadius: '22px',
        borderBottomRightRadius: '22px',
        boxShadow: '0 6px 24px rgba(15, 27, 45, 0.3)'
      }}>
        {/* Brand + User */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '17px', fontWeight: 900, letterSpacing: '1px', color: CH_GREEN }}>
            chargerhub
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#CBD5E1', textAlign: 'right' }}>
            {user?.name ? `${user.name.split(' ')[0]}'s Wallet` : "My Wallet"}
          </div>
        </div>

        {/* Balance Row */}
        <div className="wallet-balance-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="wallet-balance">
            <div style={{ fontSize: '30px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-1px', lineHeight: 1 }}>
              ₹ {wallet.balance.toFixed(2)}
            </div>
            <div style={{ maxWidth: '220px', fontSize: '10px', color: '#94A3B8', fontWeight: 600, lineHeight: 1.3, marginTop: '4px' }}>
              Wallet balance
            </div>
          </div>

          <button
            type="button"
            className="wallet-add-credits"
            onClick={() => setShowTopupModal(true)}
            style={{
              background: CH_GREEN,
              border: 'none',
              color: NAV,
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(0,200,150,0.4)'
            }}
          >
            <Plus size={16} strokeWidth={3} />
            Add Credits
          </button>
        </div>
      </div>

      <div className="wallet-content" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 90px', minWidth: 0 }}>

        {/* ── Wallet Activity Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0 14px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: '#E0FBF4',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ArrowRightLeft size={15} color={CH_GREEN} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: NAV }}>
            ChargerHub Wallet Activity
          </h3>
        </div>

        {/* ── Transaction Groups ── */}
        {Object.keys(groupedTxns).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: '#556070' }}>
            <Zap size={40} color="#E2E8F0" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', fontWeight: 700 }}>No wallet activity yet</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Charging deductions and top-ups will appear here.</p>
          </div>
        ) : (
          <div>
            {Object.entries(groupedTxns).map(([dateLabel, items]) => (
              <div key={dateLabel} style={{ marginBottom: '20px' }}>
                {/* Date Label */}
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#94A3B8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {dateLabel}
                </div>

                {/* Transaction Rows with dashed separator */}
                <div style={{ background: '#FFFFFF', borderRadius: '18px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                  {items.map((txn, i) => {
                    const isDebit = txn.type === 'debit';
                    return (
                      <div key={txn.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedTransaction(txn)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedTransaction(txn);
                            }
                          }}
                          aria-label={`View ${isDebit ? 'debit' : 'credit'} transaction details for ₹${txn.amount}`}
                          style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 16px',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}>
                          {/* Left: icon + info */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                            {/* Circular charging icon */}
                            <div style={{
                              width: '40px', height: '40px', borderRadius: '50%',
                              background: isDebit ? '#E0FBF4' : '#DCFCE7',
                              border: `2px solid ${isDebit ? CH_GREEN : '#22C55E'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Zap size={18} color={isDebit ? CH_GREEN : '#22C55E'} />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <h4 style={{
                                fontSize: '13px', fontWeight: 800, color: NAV,
                                marginBottom: '3px',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                              }}>
                                {txn.station_name || txn.description}
                              </h4>
                              <p style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                                {formatTime(txn.created_at)}
                              </p>
                            </div>
                          </div>

                          {/* Right: amount badge + chevron */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span style={{
                              background: isDebit ? '#FEE2E2' : '#DCFCE7',
                              color: isDebit ? '#DC2626' : '#16A34A',
                              padding: '5px 12px',
                              borderRadius: '20px',
                              fontSize: '13px',
                              fontWeight: 900
                            }}>
                              {isDebit ? `- ₹${txn.amount}` : `+ ₹${txn.amount}`}
                            </span>
                            <ChevronRight size={16} color="#CBD5E1" />
                          </div>
                        </div>

                        {/* Dashed separator between rows (not after last) */}
                        {i < items.length - 1 && (
                          <div style={{
                            margin: '0 16px',
                            borderTop: '1.5px dashed #E2E8F0'
                          }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reusable Add Credits Modal with Razorpay */}
      <AddCreditsModal isOpen={showTopupModal} onClose={() => setShowTopupModal(false)} />

      {selectedTransaction && (
        createPortal(<div className="modal-overlay wallet-transaction-overlay" onClick={() => setSelectedTransaction(null)}>
          <section
            className="bottom-sheet wallet-transaction-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-transaction-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="wallet-transaction-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 id="wallet-transaction-title" style={{ fontSize: '18px', fontWeight: 900, color: NAV, margin: 0 }}>
                Transaction details
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                aria-label="Close transaction details"
                style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '34px', height: '34px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <X size={18} color={NAV} />
              </button>
            </div>

            <div style={{ background: selectedIsDebit ? '#FEF2F2' : '#EAF9F3', borderRadius: '16px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: selectedIsDebit ? '#B91C1C' : '#087E63', marginBottom: '5px' }}>
                {selectedTransaction.description || (selectedIsDebit ? 'Wallet debit' : 'Wallet credit')}
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: NAV }}>
                {selectedIsDebit ? '−' : '+'} ₹{Number(selectedTransaction.amount || 0).toFixed(2)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {transactionDetails.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', padding: '12px 0', borderBottom: '1px solid #EEF1F5' }}>
                  <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 700, color: '#68718B' }}>{label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: NAV, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedTransaction(null)}
              className="btn-primary"
              style={{ marginTop: '18px' }}
            >
              Close
            </button>
          </section>
        </div>, document.body)
      )}
    </div>
  );
}
