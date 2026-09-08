const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { pool, query, queryOne, execute } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ─── Auto-ensure country column exists in users table ───────────────────────
async function initTable() {
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
initTable();

// All routes here require admin authentication
router.use(requireAuth);
router.use(requireAdmin);

// ─── GET /api/users ────────────────────────────────────────────────────────
// List all users with role, country, and search filters + statistics
router.get('/', async (req, res) => {
  try {
    const { role, country, search, page = 1, limit = 100 } = req.query;

    let sql = `
      SELECT 
        u.id, 
        u.username, 
        u.email, 
        u.name, 
        u.role, 
        COALESCE(u.country, 'Australia') AS country, 
        u.phone, 
        u.address, 
        u.avatar, 
        u.createdAt,
        (SELECT COUNT(*) FROM orders o WHERE o.customerEmail = u.email) AS ordersCount
      FROM users u
      WHERE 1=1
    `;
    const params = [];

    // Role filter
    if (role && role !== 'all') {
      sql += ' AND u.role = ?';
      params.push(role);
    }

    // Country filter
    if (country && country !== 'all') {
      sql += " AND (u.country = ? OR (u.country IS NULL AND ? = 'Australia'))";
      params.push(country, country);
    }

    // Search filter
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)';
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY u.createdAt DESC';

    const users = await query(sql, params);

    // Compute aggregated statistics for admin dashboard metrics
    const [totalRows] = await pool.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS adminCount,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) AS customerCount,
        SUM(CASE WHEN COALESCE(country, 'Australia') = 'Australia' THEN 1 ELSE 0 END) AS australiaCount,
        SUM(CASE WHEN COALESCE(country, 'Australia') = 'Sri Lanka' THEN 1 ELSE 0 END) AS srilankaCount
      FROM users
    `);

    const stats = {
      totalUsers: totalRows[0]?.totalUsers || 0,
      adminCount: totalRows[0]?.adminCount || 0,
      customerCount: totalRows[0]?.customerCount || 0,
      countries: {
        Australia: totalRows[0]?.australiaCount || 0,
        'Sri Lanka': totalRows[0]?.srilankaCount || 0,
      },
    };

    return res.json({
      success: true,
      users,
      total: users.length,
      stats,
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch users', error: err.message });
  }
});

// ─── POST /api/users ───────────────────────────────────────────────────────
// Admin creates a new administrator or customer
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('A valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['admin', 'customer']).withMessage('Role must be either admin or customer'),
    body('country').optional().isString(),
    body('phone').optional().isString(),
    body('address').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { name, email, password, role = 'admin', country = 'Australia', phone, address } = req.body;

      // Check if email already registered
      const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ success: false, message: 'A user with this email address already exists' });
      }

      // Generate unique username
      const cleanPrefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const username = `${cleanPrefix}_${Date.now().toString().slice(-4)}`;
      const id = `usr-${uuidv4().replace(/-/g, '').slice(0, 12)}`;

      const passwordHash = await bcrypt.hash(password, 10);

      await execute(
        `INSERT INTO users (id, username, email, passwordHash, name, role, country, phone, address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, username, email, passwordHash, name, role, country, phone || null, address || null]
      );

      const newUser = {
        id,
        username,
        email,
        name,
        role,
        country,
        phone: phone || null,
        address: address || null,
        createdAt: new Date().toISOString(),
        ordersCount: 0,
      };

      return res.status(201).json({
        success: true,
        message: `${role === 'admin' ? 'Administrator' : 'User'} created successfully`,
        user: newUser,
      });
    } catch (err) {
      console.error('Error creating user:', err);
      return res.status(500).json({ success: false, message: 'Failed to create user', error: err.message });
    }
  }
);

// ─── PUT /api/users/:id ────────────────────────────────────────────────────
// Admin updates user details, role, country, or resets password
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('role').optional().isIn(['admin', 'customer']).withMessage('Invalid role'),
    body('country').optional().isString(),
    body('phone').optional().isString(),
    body('address').optional().isString(),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { name, role, country, phone, address, password } = req.body;

    try {
      const existing = await queryOne('SELECT id, role, email FROM users WHERE id = ?', [id]);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Safety: current admin cannot demote their own account away from admin
      if (req.user.id === id && role && role !== 'admin') {
        return res.status(400).json({
          success: false,
          message: 'You cannot remove your own administrator privileges while logged in.',
        });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (role !== undefined) {
        updates.push('role = ?');
        values.push(role);
      }
      if (country !== undefined) {
        updates.push('country = ?');
        values.push(country);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        values.push(phone || null);
      }
      if (address !== undefined) {
        updates.push('address = ?');
        values.push(address || null);
      }
      if (password && password.trim()) {
        const hash = await bcrypt.hash(password, 10);
        updates.push('passwordHash = ?');
        values.push(hash);
      }

      if (updates.length > 0) {
        values.push(id);
        await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      const updatedUser = await queryOne(
        `SELECT id, username, email, name, role, COALESCE(country, 'Australia') AS country, phone, address, avatar, createdAt,
                (SELECT COUNT(*) FROM orders o WHERE o.customerEmail = users.email) AS ordersCount
         FROM users WHERE id = ?`,
        [id]
      );

      return res.json({
        success: true,
        message: 'User updated successfully',
        user: updatedUser,
      });
    } catch (err) {
      console.error('Error updating user:', err);
      return res.status(500).json({ success: false, message: 'Failed to update user', error: err.message });
    }
  }
);

// ─── DELETE /api/users/:id ─────────────────────────────────────────────────
// Delete user with safeguards
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Safeguard 1: cannot delete yourself
    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own active administrator account.',
      });
    }

    const targetUser = await queryOne('SELECT id, role, email FROM users WHERE id = ?', [id]);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Safeguard 2: cannot delete the last remaining admin
    if (targetUser.role === 'admin') {
      const admins = await query('SELECT id FROM users WHERE role = "admin"');
      if (admins.length <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the only remaining administrator account in the system.',
        });
      }
    }

    await execute('DELETE FROM users WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete user', error: err.message });
  }
});

module.exports = router;
