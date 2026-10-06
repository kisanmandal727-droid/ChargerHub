import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import db from '../db/index.js';
import { getFirebaseAdminAuth } from '../services/firebaseAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ev_charging_jwt_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
function normalizeIndianPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91${digits}` : null;
}

function createAppToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function getLoginUser(user) {
  const { password_hash, ...safeUser } = user;
  const vCheck = await db.query('SELECT COUNT(*) as count FROM vehicles WHERE user_id = $1', [user.id]);
  const vehicleCount = parseInt(vCheck.rows[0].count, 10);
  const wRes = await db.query('SELECT balance, coins FROM wallets WHERE user_id = $1', [user.id]);
  return {
    ...safeUser,
    hasVehicle: vehicleCount > 0,
    vehicleCount,
    wallet: wRes.rows[0] || { balance: 0.00, coins: 0 },
  };
}

async function verifyFirebaseIdToken(idToken) {
  if (!idToken) {
    const error = new Error('A Firebase ID token is required');
    error.code = 'auth/missing-id-token';
    throw error;
  }
  const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const phone = decoded.phone_number;
  if (!decoded.uid || !/^\+91\d{10}$/.test(phone || '')) {
    const error = new Error('Verify a valid Indian mobile number with Firebase Phone Auth');
    error.code = 'auth/invalid-phone-number';
    throw error;
  }
  return { uid: decoded.uid, phone };
}

function firebaseAuthError(res, err, operation) {
  console.error(`${operation} error:`, err);
  if (err.code === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
    return res.status(503).json({ error: 'Firebase Admin is not configured on the server' });
  }
  if (String(err.code || '').startsWith('auth/')) {
    return res.status(401).json({ error: err.message || 'Firebase phone verification failed' });
  }
  return res.status(500).json({ error: `${operation} failed` });
}

export const register = async (req, res) => {
  try {
    const { name, email, phone, password, referralCode } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Name, email, phone, and password are required' });
    }

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number' });
    }

    // Check if email or phone exists
    const existing = await db.query(
      `SELECT id FROM users
       WHERE email = $1 OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2`,
      [email.trim().toLowerCase(), normalizedPhone.slice(-10)]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email or phone already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Initials e.g. "Kshitij Kolte" -> "KK"
    const initials = name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const userRes = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, avatar_initials, green_km_driven)
       VALUES ($1, $2, $3, $4, 'user', $5, 0.00)
       RETURNING id, name, email, phone, role, avatar_initials, green_km_driven`,
      [name.trim(), email.trim().toLowerCase(), normalizedPhone, password_hash, initials]
    );

    const newUser = userRes.rows[0];

    // Create starting wallet with bonus coins
    const bonusCoins = referralCode ? 50 : 25;
    await db.query(
      `INSERT INTO wallets (user_id, balance, coins) VALUES ($1, 0.00, $2)`,
      [newUser.id, bonusCoins]
    );

    // Welcome notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Welcome to ChargerHub!', 'Get started by adding your EV and exploring nearby chargers.', 'system')`,
      [newUser.id]
    );

    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        ...newUser,
        hasVehicle: false,
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Server error registering user' });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or phone

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/Phone and password are required' });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();
    const phoneDigits = normalizedIdentifier.includes('@')
      ? ''
      : normalizedIdentifier.replace(/\D/g, '').slice(-10);
    const userRes = await db.query(
      `SELECT id, name, email, phone, password_hash, role, avatar_initials, green_km_driven 
       FROM users 
       WHERE email = $1 OR ($2 <> '' AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2)`,
      [normalizedIdentifier, phoneDigits]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user has vehicles
    const vCheck = await db.query(
      'SELECT COUNT(*) as count FROM vehicles WHERE user_id = $1',
      [user.id]
    );
    const vehicleCount = parseInt(vCheck.rows[0].count, 10);
    const hasVehicle = vehicleCount > 0;

    // Get wallet
    const wRes = await db.query(
      'SELECT balance, coins FROM wallets WHERE user_id = $1',
      [user.id]
    );
    const wallet = wRes.rows[0] || { balance: 0.00, coins: 0 };

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    const { password_hash, ...safeUser } = user;

    return res.json({
      message: 'Login successful',
      token,
      user: {
        ...safeUser,
        hasVehicle,
        vehicleCount,
        wallet
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
};

// ================= FIREBASE PHONE AUTH =================

export const firebaseSession = async (req, res) => {
  try {
    const { uid, phone } = await verifyFirebaseIdToken(req.body.idToken);
    const cleanPhone = phone.slice(-10);
    const byUidRes = await db.query(
      `SELECT id, name, email, phone, firebase_uid, role, avatar_initials, green_km_driven
       FROM users WHERE firebase_uid = $1`, [uid]
    );
    const userRes = await db.query(
      `SELECT id, name, email, phone, firebase_uid, role, avatar_initials, green_km_driven
       FROM users
       WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $1`,
      [cleanPhone]
    );
    const userByUid = byUidRes.rows[0];
    const userByPhone = userRes.rows[0];

    if (userByUid && userByPhone && userByUid.id !== userByPhone.id) {
      return res.status(409).json({ error: 'This verified phone is linked to a different account' });
    }
    const user = userByUid || userByPhone;
    if (!user) return res.json({ exists: false, needsProfile: true, phone });
    if (user.phone.replace(/\D/g, '').slice(-10) !== cleanPhone) {
      return res.status(409).json({ error: 'The verified phone number does not match this account' });
    }
    if (user.firebase_uid && user.firebase_uid !== uid) {
      return res.status(409).json({ error: 'This account is already linked to another Firebase user' });
    }

    const linkedRes = await db.query(
      `UPDATE users SET firebase_uid = $1
       WHERE id = $2 AND (firebase_uid IS NULL OR firebase_uid = $1)
       RETURNING id, name, email, phone, role, avatar_initials, green_km_driven`,
      [uid, user.id]
    );
    if (linkedRes.rows.length === 0) {
      return res.status(409).json({ error: 'This account could not be linked to the verified phone' });
    }
    const linkedUser = linkedRes.rows[0];
    return res.json({
      exists: true,
      message: 'Phone verified. You are signed in.',
      token: createAppToken(linkedUser),
      user: await getLoginUser(linkedUser),
    });
  } catch (err) {
    return firebaseAuthError(res, err, 'Firebase sign-in');
  }
};

export const completeProfile = async (req, res) => {
  try {
    const { name, email, phone, referralCode, idToken } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required' });
    }

    const verifiedIdentity = await verifyFirebaseIdToken(idToken);
    const fullPhone = normalizeIndianPhone(phone);
    if (!fullPhone || fullPhone !== verifiedIdentity.phone) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }
    const cleanPhone = fullPhone.slice(-10);

    // Check if already registered
    const existing = await db.query(
      `SELECT id FROM users
       WHERE email = $1 OR RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = $2`,
      [email.trim().toLowerCase(), cleanPhone]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email or phone already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(randomBytes(32).toString('hex'), salt);

    const initials = name
      .trim()
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const userRes = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, firebase_uid, role, avatar_initials, green_km_driven)
       VALUES ($1, $2, $3, $4, $5, 'user', $6, 0.00)
       RETURNING id, name, email, phone, role, avatar_initials, green_km_driven`,
      [name.trim(), email.trim().toLowerCase(), fullPhone, password_hash, verifiedIdentity.uid, initials]
    );

    const newUser = userRes.rows[0];

    const bonusCoins = referralCode ? 50 : 25;
    await db.query(
      `INSERT INTO wallets (user_id, balance, coins) VALUES ($1, 0.00, $2)`,
      [newUser.id, bonusCoins]
    );

    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Welcome to ChargerHub!', 'Get started by adding your EV and exploring nearby chargers.', 'system')`,
      [newUser.id]
    );

    return res.status(201).json({
      message: 'Account created successfully',
      token: createAppToken(newUser),
      user: await getLoginUser({ ...newUser, password_hash }),
    });
  } catch (err) {
    return firebaseAuthError(res, err, 'Complete profile');
  }
};

export const getMe = async (req, res) => {
  try {
    const userRes = await db.query(
      `SELECT id, name, email, phone, role, avatar_initials, green_km_driven, created_at 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];

    // Vehicles
    const vRes = await db.query(
      'SELECT * FROM vehicles WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [user.id]
    );

    // Wallet
    const wRes = await db.query(
      'SELECT balance, coins FROM wallets WHERE user_id = $1',
      [user.id]
    );

    return res.json({
      user: {
        ...user,
        hasVehicle: vRes.rows.length > 0,
        vehicles: vRes.rows,
        primaryVehicle: vRes.rows.find(v => v.is_primary) || vRes.rows[0] || null,
        wallet: wRes.rows[0] || { balance: 0.00, coins: 0 }
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Server error fetching profile' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const userId = req.user.id;

    const initials = name
      ? name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase()
      : undefined;

    const updated = await db.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           avatar_initials = COALESCE($4, avatar_initials),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, email, phone, role, avatar_initials, green_km_driven`,
      [name, email ? email.toLowerCase() : null, phone, initials, userId]
    );

    return res.json({
      message: 'Profile updated successfully',
      user: updated.rows[0]
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Server error updating profile' });
  }
};
