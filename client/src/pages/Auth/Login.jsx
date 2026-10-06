import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { firebaseConfigured } from '../../firebase.js';

const errorMessages = {
  'auth/operation-not-allowed': 'Enable this sign-in method in Firebase Authentication settings.',
  'auth/unauthorized-domain': 'Add this website domain to Firebase Authentication’s authorized domains.',
  'auth/popup-blocked': 'Allow pop-ups for this site, then try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
  'auth/cancelled-popup-request': 'A Google sign-in window is already open.',
  'auth/invalid-credential': 'That email and password did not match. Use the email/password account created with Sign up, or choose Google if you previously used Google for this email.',
  'auth/invalid-login-credentials': 'That email and password did not match. Use the email/password account created with Sign up, or choose Google if you previously used Google for this email.',
  'auth/wrong-password': 'That password did not match this email. If you previously used Google for this email, choose Google below.',
  'auth/user-not-found': 'No email/password account was found for that email. Sign up first, or choose Google if you previously used Google for this email.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account already uses this email. Sign in with that email/password account, or choose Google if that account was created with Google.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your internet connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z" />
      <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.6 18.7 12 24 12Z" />
    </svg>
  );
}

export default function Login({ view = 'login', onChangeView }) {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, sendPasswordReset } = useAuth();
  const isSignup = view === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const showError = (err, fallback) => setError(errorMessages[err.code] || err.message || fallback);
  const requirePolicies = () => {
    if (!acceptedPolicies) {
      setError('Please accept the Terms and Conditions and Privacy Policy to continue.');
      return false;
    }
    return true;
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!requirePolicies()) return;
    setLoading('email');
    try {
      if (isSignup) {
        await registerWithEmail({ name: name.trim(), email: email.trim(), phone: phone.trim(), password, acceptedPolicies: true });
      } else {
        await signInWithEmail(email.trim(), password, true);
      }
    } catch (err) {
      showError(err, isSignup ? 'Could not create the account. Please try again.' : 'Could not sign in. Please try again.');
    } finally {
      setLoading('');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');
    if (!requirePolicies()) return;
    setLoading('google');
    try {
      await signInWithGoogle(true);
    } catch (err) {
      showError(err, 'Google sign-in failed. Please try again.');
    } finally {
      setLoading('');
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email address first, then choose Forgot password.');
      return;
    }
    setLoading('reset');
    try {
      await sendPasswordReset(email.trim());
      setNotice('If this email has a Firebase email/password account, Firebase sent a reset link. Check Inbox, Spam/Junk, and Promotions. Google-only accounts do not have a password reset link; sign in with Google.');
    } catch (err) {
      const resetMessages = {
        'auth/invalid-email': 'Enter the same valid email address used to create your ChargerHub account.',
        'auth/user-not-found': 'Firebase could not find an email/password account for this address. Check the email, sign up first, or use Google if that account was created with Google.',
        'auth/operation-not-allowed': 'Email/Password sign-in is disabled. Enable it in Firebase Console under Authentication → Sign-in method.',
        'auth/too-many-requests': 'Firebase temporarily limited reset requests. Wait a while before trying again.',
      };
      setError(resetMessages[err.code] || err.message || 'Could not request a password reset. Check Firebase Authentication settings and try again.');
    } finally {
      setLoading('');
    }
  };

  return (
    <main className={'auth-screen' + (isSignup ? ' auth-screen-signup' : '')}>
      <div className="auth-brand">
        <div className="auth-brand-icon"><Zap size={24} strokeWidth={2.5} /></div>
        <div>
          <h1>ChargerHub</h1>
          <span>Charge On The Go</span>
        </div>
      </div>

      <h2>{isSignup ? 'Create your account' : 'Welcome to ChargerHub'}</h2>
      <p className="auth-intro">{isSignup ? 'Enter your details to get started.' : 'Sign in to continue to ChargerHub.'}</p>

      {!firebaseConfigured && (
        <div className="auth-config-message" role="status">
          Firebase web settings are missing. Add them to <code>client/.env</code> before signing in.
        </div>
      )}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-notice" role="status">{notice}</div>}

      <form onSubmit={handleEmailSubmit} className="auth-form">
        {isSignup && (
          <>
            <label className="auth-field">
              <span>Full name</span>
              <input autoComplete="name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required />
            </label>
            <label className="auth-field">
              <span>Email address</span>
              <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            </label>
            <label className="auth-field">
              <span>Phone number</span>
              <input autoComplete="tel" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" required />
            </label>
          </>
        )}
        {!isSignup && (
          <label className="auth-field">
            <span>Email address</span>
            <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>
        )}
        <label className="auth-field">
          <span>{isSignup ? 'Create password' : 'Password'}</span>
          <input autoComplete={isSignup ? 'new-password' : 'current-password'} type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" required />
        </label>
        {!isSignup && (
          <div className="auth-forgot-wrap">
            <button type="button" className="auth-forgot-link" onClick={handlePasswordReset} disabled={Boolean(loading)}>
              {loading === 'reset' ? 'Requesting reset link…' : 'Forgot password?'}
            </button>
            <span>Reset links are for email/password accounts. Use Google for Google-only accounts.</span>
          </div>
        )}
        <button type="submit" className="btn-primary auth-submit" disabled={Boolean(loading) || !firebaseConfigured}>
          {loading === 'email' ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account' : 'Sign in')}
        </button>
      </form>

      <div className="auth-divider"><span />or<span /></div>

      <button type="button" onClick={handleGoogleSignIn} disabled={Boolean(loading) || !firebaseConfigured} className="auth-google-button">
        <GoogleMark />
        <span>{loading === 'google' ? 'Connecting to Google…' : 'Sign in with Google'}</span>
      </button>

      <p className="auth-switch">
        {isSignup ? 'Already have an account?' : 'Don’t have an account?'}{' '}
        <button type="button" onClick={() => { setError(''); setNotice(''); onChangeView?.(isSignup ? 'login' : 'signup'); }}>
          {isSignup ? 'Sign in' : 'Sign up'}
        </button>
      </p>

      <label className="auth-policy-check">
        <input type="checkbox" checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} />
        <span>
          By continuing, I accept the{' '}
          <a href="#terms-and-conditions" onClick={(event) => { event.preventDefault(); onChangeView?.('terms'); }}>Terms and Conditions</a>
          {' '}and{' '}
          <a href="#privacy-policy" onClick={(event) => { event.preventDefault(); onChangeView?.('privacy'); }}>Privacy Policy</a>.
        </span>
      </label>

      <p className="auth-footer">Secure sign-in powered by Firebase</p>
    </main>
  );
}
