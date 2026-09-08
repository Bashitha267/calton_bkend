const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { pool, query, queryOne, execute } = require('../config/db');
const { spotlightUpload, buildImageUrl } = require('../middleware/upload');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const DEFAULT_SPOTLIGHTS = [
  {
    id: 'spot-1',
    username: '@alex.carlton',
    image: '/images/community_1.jpg',
    productTagged: 'Relaxed Twill TENCEL™ Shirt',
    link: '/shop',
    sortOrder: 1,
    isActive: 1,
  },
  {
    id: 'spot-2',
    username: '@marcus.style',
    image: '/images/community_2.jpg',
    productTagged: 'Pinstripe Boxy Shirt',
    link: '/shop',
    sortOrder: 2,
    isActive: 1,
  },
  {
    id: 'spot-3',
    username: '@elena.noir',
    image: '/images/community_3.jpg',
    productTagged: 'Architectural Pleated Trouser',
    link: '/shop',
    sortOrder: 3,
    isActive: 1,
  },
  {
    id: 'spot-4',
    username: '@julian.v',
    image: '/images/community_4.jpg',
    productTagged: 'Resort Collar Linen Shirt',
    link: '/shop',
    sortOrder: 4,
    isActive: 1,
  },
  {
    id: 'spot-5',
    username: '@sophia.mode',
    image: '/images/community_5.jpg',
    productTagged: 'Oversized Structured Wool Shirt',
    link: '/shop',
    sortOrder: 5,
    isActive: 1,
  },
  {
    id: 'spot-6',
    username: '@david.luxe',
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1000&auto=format&fit=crop',
    productTagged: 'Minimalist Poplin Overshirt',
    link: '/shop',
    sortOrder: 6,
    isActive: 1,
  },
];

let inMemorySpotlights = [...DEFAULT_SPOTLIGHTS];

// ─── Auto-init database table ──────────────────────────────────────────────
async function initTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_spotlight (
        id VARCHAR(50) NOT NULL,
        username VARCHAR(100) NOT NULL,
        image VARCHAR(500) NOT NULL,
        productTagged VARCHAR(255) DEFAULT NULL,
        link VARCHAR(500) DEFAULT NULL,
        sortOrder INT NOT NULL DEFAULT 0,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_active (isActive),
        KEY idx_sort (sortOrder)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const rows = await query('SELECT COUNT(*) AS cnt FROM community_spotlight');
    if (rows && rows[0] && rows[0].cnt === 0) {
      for (const item of DEFAULT_SPOTLIGHTS) {
        await execute(
          `INSERT INTO community_spotlight (id, username, image, productTagged, link, sortOrder, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.username, item.image, item.productTagged, item.link || null, item.sortOrder, item.isActive]
        );
      }
      console.log('✅ [DB] Initialized community_spotlight with seed data');
    }
  } catch (err) {
    console.warn('[CommunitySpotlight] Table check notice:', err.message);
  }
}
initTable().catch(() => {});

// ─── GET /api/community-spotlight ──────────────────────────────────────────
// Public & admin list
router.get('/', async (req, res) => {
  const { activeOnly } = req.query;
  try {
    let sql = 'SELECT * FROM community_spotlight';
    const params = [];
    if (activeOnly === 'true' || activeOnly === '1') {
      sql += ' WHERE isActive = 1';
    }
    sql += ' ORDER BY sortOrder ASC, createdAt ASC';

    const rows = await query(sql, params);
    if (rows && rows.length > 0) {
      return res.json({ success: true, spotlights: rows });
    }

    const fallback = activeOnly === 'true' || activeOnly === '1'
      ? inMemorySpotlights.filter(s => s.isActive)
      : inMemorySpotlights;
    return res.json({ success: true, spotlights: fallback });
  } catch (err) {
    console.warn('[CommunitySpotlight] Error reading DB, using fallback:', err.message);
    const fallback = activeOnly === 'true' || activeOnly === '1'
      ? inMemorySpotlights.filter(s => s.isActive)
      : inMemorySpotlights;
    return res.json({ success: true, spotlights: fallback });
  }
});

// ─── POST /api/community-spotlight/upload ──────────────────────────────────
// Dedicated image upload for spotlight
router.post(
  '/upload',
  requireAuth,
  requireAdmin,
  spotlightUpload.single('image'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }
    const imageUrl = buildImageUrl(req, req.file.path);
    return res.json({
      success: true,
      message: 'Spotlight image uploaded successfully',
      imageUrl,
      filename: req.file.filename,
    });
  }
);

// ─── POST /api/community-spotlight ─────────────────────────────────────────
// Admin creates a new spotlight item
router.post(
  '/',
  requireAuth,
  requireAdmin,
  spotlightUpload.single('image'),
  async (req, res) => {
    try {
      let imageUrl = req.body.image;
      if (req.file) {
        imageUrl = buildImageUrl(req, req.file.path);
      }

      if (!imageUrl) {
        return res.status(400).json({ success: false, message: 'Spotlight image is required' });
      }

      const id = `spot-${uuidv4().replace(/-/g, '').slice(0, 8)}`;
      let username = req.body.username || '@carlton.valley';
      if (!username.startsWith('@')) username = `@${username}`;

      const productTagged = req.body.productTagged || '';
      const link = req.body.link || '/shop';
      const sortOrder = parseInt(req.body.sortOrder) || 0;
      const isActive = req.body.isActive === '0' || req.body.isActive === false ? 0 : 1;

      try {
        await execute(
          `INSERT INTO community_spotlight (id, username, image, productTagged, link, sortOrder, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, username, imageUrl, productTagged, link, sortOrder, isActive]
        );
      } catch (dbErr) {
        // In-memory fallback
        inMemorySpotlights.push({ id, username, image: imageUrl, productTagged, link, sortOrder, isActive });
      }

      return res.status(201).json({
        success: true,
        message: 'Community spotlight post created',
        spotlight: { id, username, image: imageUrl, productTagged, link, sortOrder, isActive },
      });
    } catch (err) {
      console.error('Create spotlight error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── PUT /api/community-spotlight/:id ──────────────────────────────────────
// Admin updates a spotlight item
router.put(
  '/:id',
  requireAuth,
  requireAdmin,
  spotlightUpload.single('image'),
  async (req, res) => {
    const { id } = req.params;
    try {
      let imageUrl = req.body.image;
      if (req.file) {
        imageUrl = buildImageUrl(req, req.file.path);
      }

      let username = req.body.username;
      if (username && !username.startsWith('@')) {
        username = `@${username}`;
      }

      const updates = [];
      const values = [];

      if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
      }
      if (imageUrl !== undefined && imageUrl.trim()) {
        updates.push('image = ?');
        values.push(imageUrl);
      }
      if (req.body.productTagged !== undefined) {
        updates.push('productTagged = ?');
        values.push(req.body.productTagged);
      }
      if (req.body.link !== undefined) {
        updates.push('link = ?');
        values.push(req.body.link);
      }
      if (req.body.sortOrder !== undefined) {
        updates.push('sortOrder = ?');
        values.push(parseInt(req.body.sortOrder) || 0);
      }
      if (req.body.isActive !== undefined) {
        updates.push('isActive = ?');
        values.push(req.body.isActive === '1' || req.body.isActive === true || req.body.isActive === 1 ? 1 : 0);
      }

      if (updates.length > 0) {
        values.push(id);
        await execute(`UPDATE community_spotlight SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      const updated = await queryOne('SELECT * FROM community_spotlight WHERE id = ?', [id]);

      return res.json({
        success: true,
        message: 'Spotlight item updated successfully',
        spotlight: updated,
      });
    } catch (err) {
      console.error('Update spotlight error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── DELETE /api/community-spotlight/:id ───────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await execute('DELETE FROM community_spotlight WHERE id = ?', [id]);
    inMemorySpotlights = inMemorySpotlights.filter(s => s.id !== id);
    return res.json({ success: true, message: 'Spotlight item deleted' });
  } catch (err) {
    console.error('Delete spotlight error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/community-spotlight/reset ───────────────────────────────────
router.post('/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    await execute('DELETE FROM community_spotlight');
    for (const item of DEFAULT_SPOTLIGHTS) {
      await execute(
        `INSERT INTO community_spotlight (id, username, image, productTagged, link, sortOrder, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.username, item.image, item.productTagged, item.link || null, item.sortOrder, item.isActive]
      );
    }
    inMemorySpotlights = [...DEFAULT_SPOTLIGHTS];
    return res.json({ success: true, message: 'Community spotlight reset to defaults' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
