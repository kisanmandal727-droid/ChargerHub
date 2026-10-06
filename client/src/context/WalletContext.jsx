import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState({ balance: 0.00, coins: 0, stats: {} });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);

  const fetchWallet = async () => {
    if (!user) {
      setWallet({ balance: 0.00, coins: 0, stats: {} });
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const [wData, tData] = await Promise.all([
        api.get('/wallet'),
        api.get('/wallet/transactions')
      ]);
      setWallet(wData.wallet);
      setTransactions(tData.transactions || []);
    } catch (err) {
      console.error('Error fetching wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, [user]);

  const createRazorpayOrder = async (amount) => {
    return api.post('/wallet/razorpay/order', { amount });
  };

  const verifyRazorpayPayment = async (paymentDetails) => {
    const res = await api.post('/wallet/razorpay/verify', paymentDetails);
    await fetchWallet();
    return res;
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        transactions,
        loading,
        createRazorpayOrder,
        verifyRazorpayPayment,
        refreshWallet: fetchWallet,
        showTopupModal,
        setShowTopupModal
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
