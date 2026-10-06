import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { api } from '../api/client.js';
import { firebaseAuth } from '../firebase.js';

const AuthContext = createContext(null);
const pendingProfileKey = (uid) => 'chargerhub_pending_profile_' + uid;

function readPendingProfile(uid) {
  try {
    return JSON.parse(localStorage.getItem(pendingProfileKey(uid)) || '{}');
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    const token = localStorage.getItem('ev_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      localStorage.removeItem('ev_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    const handleLogout = () => setUser(null);
    window.addEventListener('auth_logout', handleLogout);
    return () => window.removeEventListener('auth_logout', handleLogout);
  }, []);

  const requireFirebase = () => {
    if (!firebaseAuth) throw new Error('Firebase is not configured. Add the Firebase web settings to client/.env.');
    return firebaseAuth;
  };

  const establishServerSession = async (firebaseUser, profile = {}, acceptedPolicies = false) => {
    if (!acceptedPolicies) throw new Error('Accept the Terms and Conditions and Privacy Policy to continue.');
    const idToken = await firebaseUser.getIdToken(true);
    const data = await api.post('/auth/firebase/session', {
      idToken,
      profile,
      acceptedPolicies: true,
    });
    localStorage.setItem('ev_token', data.token);
    localStorage.removeItem(pendingProfileKey(firebaseUser.uid));
    setUser(data.user);
    return data;
  };

  const signInWithEmail = async (email, password, acceptedPolicies) => {
    const auth = requireFirebase();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return establishServerSession(credential.user, readPendingProfile(credential.user.uid), acceptedPolicies);
  };

  const registerWithEmail = async ({ name, email, phone, password, acceptedPolicies }) => {
    const auth = requireFirebase();
    if (!acceptedPolicies) throw new Error('Accept the Terms and Conditions and Privacy Policy to continue.');
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const profile = { name, phone };
    localStorage.setItem(pendingProfileKey(credential.user.uid), JSON.stringify(profile));
    await updateProfile(credential.user, { displayName: name });
    return establishServerSession(credential.user, profile, acceptedPolicies);
  };

  const signInWithGoogle = async (acceptedPolicies) => {
    const auth = requireFirebase();
    if (!acceptedPolicies) throw new Error('Accept the Terms and Conditions and Privacy Policy to continue.');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    return establishServerSession(credential.user, readPendingProfile(credential.user.uid), acceptedPolicies);
  };

  const sendPasswordReset = async (email) => {
    await sendPasswordResetEmail(requireFirebase(), email);
  };

  const updateAccountProfile = async (changes) => {
    const data = await api.put("/auth/profile", changes);
    setUser((current) => ({ ...current, ...data.user }));
    if (changes.name && firebaseAuth?.currentUser) {
      try {
        await updateProfile(firebaseAuth.currentUser, { displayName: data.user?.name || changes.name.trim() });
      } catch (err) {
        console.warn("Could not sync the Firebase display name:", err);
      }
    }
    return data.user;
  };
  const logout = () => {
    localStorage.removeItem('ev_token');
    setUser(null);
    if (firebaseAuth?.currentUser) signOut(firebaseAuth).catch((err) => console.error('Firebase sign-out failed:', err));
    if (window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const needsVehicleSetup = Boolean(user && user.role !== 'admin' && !user.hasVehicle);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithEmail,
        registerWithEmail,
        signInWithGoogle,
        sendPasswordReset,
        updateAccountProfile,
        logout,
        refreshUser: fetchCurrentUser,
        needsVehicleSetup,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);




