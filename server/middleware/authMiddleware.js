import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { isTokenBlacklisted } from '../config/redis.js';

/**
 * JWT verification middleware.
 * Attaches decoded token payload to req.user.
 */
export async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Access denied. Invalid token format.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.userId) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    if (decoded.jti) {
      const blacklisted = await isTokenBlacklisted(decoded.jti);
      if (blacklisted) {
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
      }
    }

    // Backward compatibility: tokens issued before the role field was added
    // will not contain a role claim — default them to 'user'.
    if (!decoded.role) {
      decoded.role = 'user';
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Role-gating middleware factory.
 * Usage: router.post('/admin-only', verifyJWT, requireRole('admin'), handler)
 *
 * @param {string} role - Required role (e.g. 'admin')
 * @returns {Function} Express middleware
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Access denied. Requires ${role} role.` });
    }
    next();
  };
}

/**
 * Validate a string as a valid MongoDB ObjectId.
 * Returns true if valid, false otherwise.
 */
export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Verify that a document belongs to the requesting user.
 * Used to prevent users from accessing other users' profiles, goals, etc.
 *
 * @param {Object} document - Mongoose document or lean object
 * @param {string} requestingUserId - req.user.userId
 * @returns {boolean}
 */
export function isOwner(document, requestingUserId) {
  if (!document || !requestingUserId) return false;
  const docUserId = document.userId?.toString?.() || document.userId;
  return docUserId === requestingUserId.toString();
}
