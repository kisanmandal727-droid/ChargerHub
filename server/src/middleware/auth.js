import jwt from 'jsonwebtoken';
import db from '../db/firestore.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_ev_charging_jwt_key_2026');
    const user = await db.get('users', decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    if (!decoded.firebase_uid || user.firebase_uid !== decoded.firebase_uid) {
      return res.status(401).json({ error: 'Please sign in again with Firebase' });
    }

    const adminRecord = await db.collection('admin_users').doc(user.firebase_uid).get();
    const authorizedAsAdmin = adminRecord.exists && adminRecord.data()?.enabled === true;
    const currentRole = authorizedAsAdmin ? 'admin' : 'user';
    if (user.role !== currentRole) {
      await db.update('users', user.id, { role: currentRole });
    }

    const { password_hash, ...safeUser } = user;
    req.user = { ...safeUser, role: currentRole };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
};

export const authenticateSimulator = (req, res, next) => {
  const apiKey = req.headers['x-simulator-key'] || req.query.apiKey;
  const expectedKey = process.env.SIMULATOR_API_KEY || 'ev_sim_secret_token_8899';

  if (apiKey && apiKey === expectedKey) {
    return next();
  }

  // Also allow authenticated admin
  return authenticateToken(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ error: 'Unauthorized simulator access' });
  });
};

