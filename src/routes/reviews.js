const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query, queryOne, execute } = require('../config/db');
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');

// ─── GET /api/reviews?productId=xxx ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { productId, status } = req.query;
    let sql = 'SELECT * FROM reviews WHERE 1=1';
    const params = [];

    if (productId) { sql += ' AND productId = ?'; params.push(productId); }
    if (status)    { sql += ' AND status = ?';    params.push(status); }

    sql += ' ORDER BY date DESC';
    const reviews = await query(sql, params);
    return res.json({ success: true, data: reviews });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// ─── POST /api/reviews ────────────────────────────────────────────────────
// Customers submit a review (authenticated or guest)
router.post(
  '/',
  optionalAuth,
  [
    body('productId').notEmpty(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').trim().notEmpty(),
    body('reviewerName').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { productId, rating, title, comment, reviewerName, itemSize, itemColor, mediaType, mediaUrl, mediaThumbnail } = req.body;

      // Verify product exists
      const product = await queryOne('SELECT id FROM products WHERE id = ?', [productId]);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

      const { v4: uuidv4 } = require('uuid');
      const id = 'rev-' + uuidv4().replace(/-/g, '').slice(0, 10);
      const date = new Date().toLocaleDateString('en-US');

      await execute(
        `INSERT INTO reviews (id, productId, reviewerName, verified, date, rating, title, comment, itemSize, itemColor, mediaType, mediaUrl, mediaThumbnail, status)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, productId, reviewerName, date, rating, title || null, comment, itemSize || null, itemColor || null, mediaType || null, mediaUrl || null, mediaThumbnail || null]
      );

      // Update product rating average
      const reviews = await query("SELECT rating FROM reviews WHERE productId = ? AND status = 'approved'", [productId]);
      if (reviews.length > 0) {
        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
        await execute('UPDATE products SET rating = ?, reviewCount = ? WHERE id = ?', [avg.toFixed(1), reviews.length, productId]);
      }

      return res.status(201).json({ success: true, data: { id, status: 'pending' } });
    } catch (err) {
      console.error('POST /reviews error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  }
);

// ─── PATCH /api/reviews/:id/status ───────────────────────────────────────
// Admin: approve / reject / pending
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const review = await queryOne('SELECT id, productId FROM reviews WHERE id = ?', [id]);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    await execute('UPDATE reviews SET status = ? WHERE id = ?', [status, id]);

    // Recalculate product rating from approved reviews
    const approvedReviews = await query("SELECT rating FROM reviews WHERE productId = ? AND status = 'approved'", [review.productId]);
    const avg = approvedReviews.length > 0
      ? (approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length).toFixed(1)
      : 0;
    await execute('UPDATE products SET rating = ?, reviewCount = ? WHERE id = ?', [avg, approvedReviews.length, review.productId]);

    return res.json({ success: true, message: `Review ${status}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// ─── DELETE /api/reviews/:id ──────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const review = await queryOne('SELECT id, productId FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    await execute('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    // Recalculate
    const approvedReviews = await query("SELECT rating FROM reviews WHERE productId = ? AND status = 'approved'", [review.productId]);
    const avg = approvedReviews.length > 0
      ? (approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length).toFixed(1)
      : 0;
    await execute('UPDATE products SET rating = ?, reviewCount = ? WHERE id = ?', [avg, approvedReviews.length, review.productId]);

    return res.json({ success: true, message: 'Review deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

module.exports = router;
