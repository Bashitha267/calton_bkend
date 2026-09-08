const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool, query, queryOne, execute } = require('../config/db');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  requireAuth,
} = require('../middleware/auth');

// ─── Auto-ensure country column exists in users table ───────────────────────
async function initUsersTable() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'country'");
    if (!cols || cols.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN country VARCHAR(100) DEFAULT 'Australia' AFTER role");
      console.log('✅ [DB] Added country column to users table');
    }
  } catch (err) {
    console.warn('[DB] Notice checking users.country column:', err.message);
  }
}
initUsersTable();

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
        'SELECT id, username, email, name, role, country, passwordHash, phone, address, avatar FROM users WHERE email = ? OR username = ? LIMIT 1',
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
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email address is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      let { name, email, password, phone, address, country = 'Australia', username } = req.body;
      const validCountries = ['Australia', 'Sri Lanka'];
      const selectedCountry = validCountries.includes(country) ? country : 'Australia';

      // Clean or generate username
      if (username && typeof username === 'string' && username.trim()) {
        username = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      }
      if (!username) {
        const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'client';
        username = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // Check existing email
      const existingEmail = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      if (existingEmail) {
        return res.status(409).json({ success: false, message: 'This email is already registered. Please sign in.' });
      }

      // Check existing username, auto-disambiguate if needed
      const existingUser = await queryOne('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
      if (existingUser) {
        username = `${username}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const crypto = require('crypto');
      const id = 'usr-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

      // Execute standard parameterized insert for all 9 fields
      await execute(
        'INSERT INTO users (id, username, email, passwordHash, name, role, country, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          username,
          email,
          passwordHash,
          name.trim(),
          'customer',
          selectedCountry,
          phone && typeof phone === 'string' && phone.trim() ? phone.trim() : null,
          address && typeof address === 'string' && address.trim() ? address.trim() : null,
        ]
      );

      const tokenPayload = { id, role: 'customer', email };
      const accessToken  = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Store refresh token hash in DB
      try {
        const refreshHash = await bcrypt.hash(refreshToken, 6);
        await execute('UPDATE users SET refreshToken = ? WHERE id = ?', [refreshHash, id]);
      } catch (tokenErr) {
        console.warn('[AUTH] Notice saving refreshToken hash:', tokenErr.message);
      }

      return res.status(201).json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id,
          username,
          email,
          name: name.trim(),
          role: 'customer',
          country: selectedCountry,
          phone: phone ? phone.trim() : null,
          address: address ? address.trim() : null,
        },
      });
    } catch (err) {
      console.error('Register error:', err);
      let message = 'Registration failed. Please try again.';
      if (err.code === 'ER_DUP_ENTRY') {
        message = 'An account with this email or username already exists.';
      } else if (err.message) {
        message = err.message;
      }
      return res.status(500).json({ success: false, message });
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
      'SELECT id, username, email, name, role, country, phone, address, avatar, createdAt FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
