import jwt from 'jsonwebtoken';
import db from '../db/firestore.js';
import { getFirebaseAdminAuth } from '../services/firebaseAdmin.js';
import { syncAuthorAvatar } from './buzzController.js';

const LEGAL_VERSION = '2026-10-04';

const tokenFor = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, firebase_uid: user.firebase_uid },
  process.env.JWT_SECRET || 'super_secret_ev_charging_jwt_key_2026',
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
);

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? '+91' + digits : null;
};

async function withAccountData(user) {
  const [vehicles, wallet] = await Promise.all([
    db.where('vehicles', 'user_id', Number(user.id)),
    db.findOneBy('wallets', 'user_id', Number(user.id)),
  ]);
  const { password_hash, ...safeUser } = user;
  return {
    ...safeUser,
    hasVehicle: vehicles.length > 0,
    vehicleCount: vehicles.length,
    wallet: wallet ? { balance: wallet.balance, coins: wallet.coins } : { balance: 0, coins: 0 },
  };
}

async function verifiedFirebaseIdentity(idToken, profile = {}) {
  if (!idToken) {
    const error = new Error('A Firebase ID token is required');
    error.code = 'auth/missing-id-token';
    throw error;
  }

  const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const email = String(decoded.email || '').trim().toLowerCase();
  const provider = decoded.firebase?.sign_in_provider;
  if (!decoded.uid || !email || !['google.com', 'password'].includes(provider) || (provider === 'google.com' && decoded.email_verified !== true)) {
    const error = new Error('Sign in with Google or email and password');
    error.code = 'auth/invalid-credential';
    throw error;
  }

  const adminRecord = await db.collection('admin_users').doc(decoded.uid).get();
  const isAdmin = adminRecord.exists && adminRecord.data()?.enabled === true;
  return {
    uid: decoded.uid,
    email,
    name: String(profile?.name || decoded.name || '').trim().slice(0, 80),
    phone: String(profile?.phone || '').trim(),
    isAdmin,
  };
}

function authFailure(res, err, operation) {
  console.error(operation + ' error:', err);
  if (err.code === 'FIREBASE_ADMIN_NOT_CONFIGURED') return res.status(503).json({ error: 'Firebase Admin is not configured on the server' });
  if (Number(err.code) === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(err.message || '')) {
    return res.status(503).json({ error: 'ChargerHub’s Firestore quota is temporarily exhausted. Please try again later.' });
  }
  if (String(err.code || '').startsWith('auth/')) return res.status(401).json({ error: err.message || 'Firebase sign-in failed' });
  return res.status(500).json({ error: operation + ' failed' });
}

export const firebaseSession = async (req, res) => {
  try {
    if (req.body.acceptedPolicies !== true) {
      return res.status(400).json({ error: 'Accept the Terms and Conditions and Privacy Policy to continue' });
    }

    const identity = await verifiedFirebaseIdentity(req.body.idToken, req.body.profile || {});
    const normalizedPhone = identity.phone ? normalizePhone(identity.phone) : null;
    if (identity.phone && !normalizedPhone) {
      return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
    }

    const [userByUid, userByEmail] = await Promise.all([
      db.findOneBy('users', 'firebase_uid', identity.uid),
      db.findOneBy('users', 'email', identity.email),
    ]);
    if (userByUid && userByEmail && userByUid.id !== userByEmail.id) {
      return res.status(409).json({ error: 'This Firebase account conflicts with an existing ChargerHub profile' });
    }

    let user = userByUid || userByEmail;
    if (user?.firebase_uid && user.firebase_uid !== identity.uid) {
      return res.status(409).json({ error: 'This profile is already linked to another Firebase account' });
    }

    const name = String(user?.name || req.body.profile?.name || identity.name || identity.email.split('@')[0]).trim().slice(0, 80);
    const avatar_initials = name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const acceptedAt = new Date().toISOString();
    const profileUpdates = {
      firebase_uid: identity.uid,
      email: identity.email,
      name,
      avatar_initials,
      role: identity.isAdmin ? 'admin' : 'user',
      accepted_terms_at: acceptedAt,
      accepted_terms_version: LEGAL_VERSION,
      accepted_privacy_at: acceptedAt,
      accepted_privacy_version: LEGAL_VERSION,
    };
    if (normalizedPhone && !String(user?.phone || "").trim()) profileUpdates.phone = normalizedPhone;

    let created = false;
    if (user) {
      user = await db.update('users', user.id, profileUpdates);
    } else {
      user = await db.create('users', {
        ...profileUpdates,
        phone: normalizedPhone || '',
        green_km_driven: 0,
      });
      created = true;
      await Promise.all([
        db.create('wallets', { user_id: user.id, balance: 0, coins: 25 }),
        db.create('notifications', {
          user_id: user.id,
          title: 'Welcome to ChargerHub!',
          message: 'Get started by adding your EV and exploring nearby chargers.',
          type: 'system',
          is_read: false,
        }),
      ]);
    }

    return res.json({
      exists: true,
      created,
      message: 'Firebase sign-in successful.',
      token: tokenFor(user),
      user: await withAccountData(user),
    });
  } catch (err) {
    return authFailure(res, err, 'Firebase sign-in');
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await db.get('users', req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const vehicles = await db.where('vehicles', 'user_id', Number(user.id));
    const wallet = await db.findOneBy('wallets', 'user_id', Number(user.id));
    return res.json({
      user: {
        ...await withAccountData(user),
        vehicles,
        primaryVehicle: vehicles.find((vehicle) => vehicle.is_primary) || vehicles[0] || null,
        wallet: wallet ? { balance: wallet.balance, coins: wallet.coins } : { balance: 0, coins: 0 },
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Server error fetching profile' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email, phone, avatar_url } = req.body;
    const changes = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const cleanName = String(name || "").trim();
      if (!cleanName || cleanName.length > 80) return res.status(400).json({ error: "Enter a name with 1 to 80 characters" });
      changes.name = cleanName;
      changes.avatar_initials = cleanName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    }

    if (email) changes.email = String(email).trim().toLowerCase();

    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
      const cleanPhone = String(phone || "").trim();
      if (!cleanPhone) {
        changes.phone = "";
      } else {
        const normalizedPhone = normalizePhone(cleanPhone);
        if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid 10-digit phone number" });
        changes.phone = normalizedPhone;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "avatar_url")) {
      if (avatar_url === null || avatar_url === "") {
        changes.avatar_url = null;
      } else if (typeof avatar_url !== "string" || avatar_url.length > 500000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar_url)) {
        return res.status(400).json({ error: "Choose a JPEG profile image under 400 KB" });
      } else {
        changes.avatar_url = avatar_url;
      }
    }

    if (!Object.keys(changes).length) return res.status(400).json({ error: "There are no profile changes to save" });
    const user = await db.update("users", req.user.id, changes);
    if (!user) return res.status(404).json({ error: "User profile not found" });
    const avatarWasSubmitted = Object.prototype.hasOwnProperty.call(req.body, 'avatar_url');
    const needsInitialBuzzAvatarSync = Boolean(user.avatar_url) && !user.buzz_avatar_synced_at;
    if (avatarWasSubmitted || needsInitialBuzzAvatarSync) {
      try {
        await syncAuthorAvatar(req.user.firebase_uid, user.avatar_url || null);
        await db.update('users', user.id, { buzz_avatar_synced_at: new Date().toISOString() });
      } catch (syncError) {
        console.error('Could not refresh Buzz profile photos:', syncError.message || syncError);
      }
    }
    return res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ error: "Server error updating profile" });
  }
};





