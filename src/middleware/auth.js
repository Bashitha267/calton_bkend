const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';

/**
 * Middleware: require a valid JWT access token.
 * Attaches decoded payload to req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

/**
 * Middleware: optional authentication.
 * If token is present and valid, attaches req.user.
 * If not present or invalid, req.user remains null without failing the request.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

/**
 * Middleware: require the authenticated user to have role === 'admin'.
 * Must be used after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

/**
 * Generate a short-lived access token (default 15 min).
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

/**
 * Generate a long-lived refresh token (default 7 days).
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

/**
 * Verify a refresh token. Returns payload or throws.
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
};
