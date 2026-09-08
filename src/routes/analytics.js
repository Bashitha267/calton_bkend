/**
 * Carlton Valley — Analytics Route
 * POST /api/analytics/track  — record a view / click / add_to_bag event
 * GET  /api/analytics/summary — return per-product counts (admin only)
 */

const router = require('express').Router();
const { pool, query } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ─── Auto-create product_views table if it doesn't exist ─────────────────
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`product_views\` (
      \`id\`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`productId\` VARCHAR(50)     NOT NULL,
      \`event\`     ENUM('view','click','add_to_bag') NOT NULL,
      \`sessionId\` VARCHAR(100)    DEFAULT NULL,
      \`country\`   VARCHAR(100)    DEFAULT NULL,
      \`createdAt\` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_pv_product\`       (\`productId\`),
      KEY \`idx_pv_event\`         (\`event\`),
      KEY \`idx_pv_created\`       (\`createdAt\`),
      KEY \`idx_pv_product_event\`  (\`productId\`, \`event\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
ensureTable().catch(err => console.warn('[Analytics] ensureTable:', err.message));

// ─── POST /api/analytics/track ────────────────────────────────────────────
// Public — no auth needed (called from the browser, fire-and-forget)
router.post('/track', async (req, res) => {
  try {
    const { productId, event, sessionId, country } = req.body;

    if (!productId || !event) {
      return res.status(400).json({ success: false, message: 'productId and event are required' });
    }

    const validEvents = ['view', 'click', 'add_to_bag'];
    if (!validEvents.includes(event)) {
      return res.status(400).json({ success: false, message: `event must be one of: ${validEvents.join(', ')}` });
    }

    await pool.query(
      'INSERT INTO product_views (productId, event, sessionId, country) VALUES (?, ?, ?, ?)',
      [productId, event, sessionId || null, country || null]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[Analytics] track error:', err.message);
    // Return 200 so the client fire-and-forget doesn't error out
    return res.json({ success: false });
  }
});

// ─── GET /api/analytics/summary ──────────────────────────────────────────
// Admin only — returns view/click/add_to_bag counts per product, filterable by days
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 0; // 0 = all time

    let dateFilter = '';
    const params = [];

    if (days > 0) {
      dateFilter = 'WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)';
      params.push(days);
    }

    const rows = await query(
      `SELECT
         productId,
         SUM(event = 'view')       AS views,
         SUM(event = 'click')      AS clicks,
         SUM(event = 'add_to_bag') AS addToBag
       FROM product_views
       ${dateFilter}
       GROUP BY productId`,
      params
    );

    // Build a map: { productId → { views, clicks, addToBag } }
    const summary = {};
    for (const row of rows) {
      summary[row.productId] = {
        views:    Number(row.views)    || 0,
        clicks:   Number(row.clicks)   || 0,
        addToBag: Number(row.addToBag) || 0,
      };
    }

    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error('[Analytics] summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics summary' });
  }
});

module.exports = router;
