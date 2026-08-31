const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, queryOne, execute } = require('../config/db');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  requireAuth,
} = require('../middleware/auth');

// ─── POST /api/auth/login ──────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').notEmpty().withMessage('Email or username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { email, password } = req.body;

      // Find user by email or username
      const user = await queryOne(
        'SELECT id, username, email, name, role, passwordHash, phone, address, avatar FROM users WHERE email = ? OR username = ? LIMIT 1',
        [email, email]
      );

      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Generate tokens
      const tokenPayload = { id: user.id, role: user.role, email: user.email };
      const accessToken  = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Store refresh token hash in DB
      const refreshHash = await bcrypt.hash(refreshToken, 6); // low cost — not a password
      await execute('UPDATE users SET refreshToken = ? WHERE id = ?', [refreshHash, user.id]);

      // Return user data + tokens (never return passwordHash)
      const { passwordHash: _, refreshToken: __, ...safeUser } = user;

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        user: safeUser,
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─── POST /api/auth/register (customer self-registration) ─────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { name, email, password, phone, address } = req.body;
      const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString().slice(-4);

      // Check existing
      const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const { v4: uuidv4 } = require('uuid');
      const id = 'usr-' + uuidv4().replace(/-/g, '').slice(0, 12);

      await execute(
        'INSERT INTO users (id, username, email, passwordHash, name, role, phone, address) VALUES (?, ?, ?, ?, ?, "customer", ?, ?)',
        [id, username, email, passwordHash, name, phone || null, address || null]
      );

      const tokenPayload = { id, role: 'customer', email };
      const accessToken  = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      return res.status(201).json({
        success: true,
        accessToken,
        refreshToken,
        user: { id, username, email, name, role: 'customer', phone, address },
      });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─── POST /api/auth/refresh ────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'Refresh token required' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await queryOne('SELECT id, role, email, refreshToken FROM users WHERE id = ?', [decoded.id]);

    if (!user || !user.refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    // Verify the stored hash matches
    const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const tokenPayload = { id: user.id, role: user.role, email: user.email };
    const newAccessToken  = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Rotate refresh token
    const newHash = await bcrypt.hash(newRefreshToken, 6);
    await execute('UPDATE users SET refreshToken = ? WHERE id = ?', [newHash, user.id]);

    return res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await execute('UPDATE users SET refreshToken = NULL WHERE id = ?', [req.user.id]);
    return res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, email, name, role, phone, address, avatar, createdAt FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
