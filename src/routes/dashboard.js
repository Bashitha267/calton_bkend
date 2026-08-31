const router = require('express').Router();
const { query, queryOne } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

// ─── GET /api/dashboard/stats ─────────────────────────────────────────────
// Admin only — aggregated stats for the dashboard page
router.get('/stats', requireAuth, requireAdmin, cacheMiddleware('dashboard'), async (req, res) => {
  try {
    // Run all aggregation queries in parallel for speed
    const [
      [orderStats],
      [productStats],
      [reviewStats],
      recentOrders,
      topProducts,
      ordersByStatus,
      revenueByMonth,
    ] = await Promise.all([
      // Order totals
      query(`
        SELECT
          COUNT(*) AS totalOrders,
          COALESCE(SUM(totalAUD), 0) AS totalRevenue,
          COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pendingOrders,
          COALESCE(SUM(CASE WHEN status = 'Processing' THEN 1 ELSE 0 END), 0) AS processingOrders,
          COALESCE(SUM(CASE WHEN status = 'Shipped' THEN 1 ELSE 0 END), 0) AS shippedOrders,
          COALESCE(SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END), 0) AS deliveredOrders,
          COALESCE(SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END), 0) AS cancelledOrders
        FROM orders
      `),

      // Product totals
      query(`
        SELECT
          COUNT(*) AS totalProducts,
          COALESCE(SUM(CASE WHEN inStock = 1 THEN 1 ELSE 0 END), 0) AS inStockProducts,
          COALESCE(SUM(CASE WHEN isComingSoon = 1 THEN 1 ELSE 0 END), 0) AS comingSoonProducts,
          COALESCE(SUM(CASE WHEN isNewArrival = 1 THEN 1 ELSE 0 END), 0) AS newArrivalProducts
        FROM products
      `),

      // Review totals
      query(`
        SELECT
          COUNT(*) AS totalReviews,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingReviews,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS approvedReviews
        FROM reviews
      `),

      // Recent 5 orders
      query(`
        SELECT id, customerName, totalAUD, status, date, country, district
        FROM orders
        ORDER BY date DESC
        LIMIT 5
      `),

      // Top 5 products by order quantity
      query(`
        SELECT oi.productName, SUM(oi.quantity) AS totalSold, SUM(oi.quantity * oi.priceAUD) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.orderId
        WHERE o.status != 'Cancelled'
        GROUP BY oi.productName
        ORDER BY totalSold DESC
        LIMIT 5
      `),

      // Orders grouped by status
      query(`
        SELECT status, COUNT(*) AS count
        FROM orders
        GROUP BY status
      `),

      // Revenue by month (last 6 months)
      query(`
        SELECT
          DATE_FORMAT(STR_TO_DATE(SUBSTRING(date, 1, 7), '%Y-%m'), '%b %Y') AS month,
          COALESCE(SUM(totalAUD), 0) AS revenue,
          COUNT(*) AS orderCount
        FROM orders
        WHERE status != 'Cancelled'
          AND date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
        GROUP BY DATE_FORMAT(STR_TO_DATE(SUBSTRING(date, 1, 7), '%Y-%m'), '%b %Y'),
                 SUBSTRING(date, 1, 7)
        ORDER BY SUBSTRING(date, 1, 7) ASC
      `),
    ]);

    return res.json({
      success: true,
      data: {
        orders: {
          total: parseInt(orderStats.totalOrders),
          revenue: parseFloat(orderStats.totalRevenue),
          pending: parseInt(orderStats.pendingOrders),
          processing: parseInt(orderStats.processingOrders),
          shipped: parseInt(orderStats.shippedOrders),
          delivered: parseInt(orderStats.deliveredOrders),
          cancelled: parseInt(orderStats.cancelledOrders),
        },
        products: {
          total: parseInt(productStats.totalProducts),
          inStock: parseInt(productStats.inStockProducts),
          comingSoon: parseInt(productStats.comingSoonProducts),
          newArrivals: parseInt(productStats.newArrivalProducts),
        },
        reviews: {
          total: parseInt(reviewStats.totalReviews),
          pending: parseInt(reviewStats.pendingReviews),
          approved: parseInt(reviewStats.approvedReviews),
        },
        recentOrders: recentOrders.map(o => ({
          ...o,
          totalAUD: parseFloat(o.totalAUD),
        })),
        topProducts,
        ordersByStatus,
        revenueByMonth,
      },
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
