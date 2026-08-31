const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query, queryOne, execute, withTransaction } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Sri Lanka districts (25)
const SL_DISTRICTS = [
  'Colombo','Gampaha','Kalutara',
  'Kandy','Matale','Nuwara Eliya',
  'Galle','Matara','Hambantota',
  'Jaffna','Kilinochchi','Mannar','Mullaitivu','Vavuniya',
  'Trincomalee','Batticaloa','Ampara',
  'Kurunegala','Puttalam',
  'Anuradhapura','Polonnaruwa',
  'Badulla','Monaragala',
  'Ratnapura','Kegalle',
];

// Australian states/territories (8)
const AU_STATES = [
  'New South Wales (NSW)',
  'Victoria (VIC)',
  'Queensland (QLD)',
  'Western Australia (WA)',
  'South Australia (SA)',
  'Tasmania (TAS)',
  'Australian Capital Territory (ACT)',
  'Northern Territory (NT)',
];

// ─── GET /api/orders/locations ────────────────────────────────────────────
// Public — returns country options + sub-location lists for checkout forms
router.get('/locations', (req, res) => {
  return res.json({
    success: true,
    data: {
      countries: [
        {
          value: 'Sri Lanka',
          label: 'Sri Lanka 🇱🇰',
          subLabel: 'District',
          subLocations: SL_DISTRICTS,
        },
        {
          value: 'Australia',
          label: 'Australia 🇦🇺',
          subLabel: 'State / Territory',
          subLocations: AU_STATES,
        },
      ],
    },
  });
});

// ─── GET /api/orders ──────────────────────────────────────────────────────
// Admin: all orders. Customer: their own orders only.
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const isAdmin = req.user.role === 'admin';

    let sql = 'SELECT o.* FROM orders o WHERE 1=1';
    const params = [];

    if (!isAdmin) {
      sql += ' AND o.customerEmail = ?';
      params.push(req.user.email);
    }

    if (status)  { sql += ' AND o.status = ?';                              params.push(status); }
    if (search)  {
      sql += ' AND (o.customerName LIKE ? OR o.id LIKE ? OR o.customerEmail LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Count total for pagination
    const countSql = sql.replace('SELECT o.*', 'SELECT COUNT(*) as total');
    const [{ total }] = await query(countSql, params);

    sql += ' ORDER BY o.date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const orders = await query(sql, params);
    if (!orders.length) return res.json({ success: true, data: [], total: 0 });

    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const items = await query(
      `SELECT * FROM order_items WHERE orderId IN (${placeholders})`,
      orderIds
    );

    const itemMap = {};
    for (const item of items) {
      if (!itemMap[item.orderId]) itemMap[item.orderId] = [];
      itemMap[item.orderId].push({
        productId: item.productId,
        productName: item.productName,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        priceAUD: parseFloat(item.priceAUD),
        image: item.image,
      });
    }

    const assembled = orders.map(o => ({
      id: o.id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      date: o.date,
      totalAUD: parseFloat(o.totalAUD),
      status: o.status,
      shippingAddress: o.shippingAddress,
      country: o.country,
      district: o.district,
      paymentMethod: o.paymentMethod,
      trackingNumber: o.trackingNumber,
      items: itemMap[o.id] || [],
    }));

    return res.json({ success: true, data: assembled, total: parseInt(total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('GET /orders error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await queryOne('SELECT * FROM orders WHERE id = ?', [id]);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Non-admin can only view their own orders
    if (req.user.role !== 'admin' && order.customerEmail !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const items = await query('SELECT * FROM order_items WHERE orderId = ?', [id]);

    return res.json({
      success: true,
      data: {
        ...order,
        totalAUD: parseFloat(order.totalAUD),
        items: items.map(i => ({ ...i, priceAUD: parseFloat(i.priceAUD) })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/orders ─────────────────────────────────────────────────────
// Create a new order (authenticated customers or admin)
router.post(
  '/',
  requireAuth,
  [
    body('customerName').trim().notEmpty(),
    body('customerEmail').isEmail(),
    body('country').isIn(['Sri Lanka', 'Australia']).withMessage('Country must be Sri Lanka or Australia'),
    body('district').trim().notEmpty().withMessage('District/State is required'),
    body('shippingAddress').trim().notEmpty(),
    body('paymentMethod').trim().notEmpty(),
    body('items').isArray({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const {
        customerName, customerEmail, customerPhone,
        shippingAddress, country, district,
        paymentMethod, items,
      } = req.body;

      // Validate district against country
      if (country === 'Sri Lanka' && !SL_DISTRICTS.includes(district)) {
        return res.status(400).json({ success: false, message: 'Invalid district for Sri Lanka' });
      }
      if (country === 'Australia' && !AU_STATES.some(s => s === district)) {
        return res.status(400).json({ success: false, message: 'Invalid state for Australia' });
      }

      // Generate order ID
      const { v4: uuidv4 } = require('uuid');
      const orderId = 'ORD-' + Math.floor(Math.random() * 90000 + 10000);
      const totalAUD = items.reduce((sum, i) => sum + (parseFloat(i.priceAUD) * parseInt(i.quantity)), 0);
      const date = new Date().toISOString().replace('T', ' ').slice(0, 16);

      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO orders (id, customerName, customerEmail, customerPhone, date, totalAUD, status, shippingAddress, country, district, paymentMethod)
           VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
          [orderId, customerName, customerEmail, customerPhone || null, date, totalAUD, shippingAddress, country, district, paymentMethod]
        );

        for (const item of items) {
          const itemId = 'item-' + uuidv4().replace(/-/g, '').slice(0, 10);
          await conn.execute(
            'INSERT INTO order_items (id, orderId, productId, productName, color, size, quantity, priceAUD, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [itemId, orderId, item.productId, item.productName, item.color, item.size, item.quantity, item.priceAUD, item.image || null]
          );
        }
      });

      return res.status(201).json({
        success: true,
        data: { id: orderId, status: 'Pending', totalAUD, date },
      });
    } catch (err) {
      console.error('POST /orders error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─── PATCH /api/orders/:id/status ─────────────────────────────────────────
// Admin: update order status
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber } = req.body;

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const updates = ['status = ?'];
    const vals = [status];

    if (trackingNumber !== undefined) { updates.push('trackingNumber = ?'); vals.push(trackingNumber); }

    await execute(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, [...vals, id]);

    return res.json({ success: true, message: 'Order status updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE /api/orders/:id ───────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await execute('DELETE FROM order_items WHERE orderId = ?', [id]);
    await execute('DELETE FROM orders WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
