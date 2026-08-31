const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { query, queryOne, execute } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

// ─── GET /api/categories ──────────────────────────────────────────────────
router.get('/', cacheMiddleware('categories'), async (req, res) => {
  try {
    const categories = await query('SELECT * FROM categories ORDER BY sortOrder, id');
    return res.json({ success: true, data: categories });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/categories/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const cat = await queryOne('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    return res.json({ success: true, data: cat });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/categories ─────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireAdmin,
  [
    body('title').trim().notEmpty(),
    body('buttonText').trim().notEmpty(),
    body('link').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { id, title, buttonText, image, link, description, itemCount, sortOrder } = req.body;
      const { v4: uuidv4 } = require('uuid');
      const catId = id || ('cat-' + uuidv4().replace(/-/g, '').slice(0, 8));

      await execute(
        'INSERT INTO categories (id, title, buttonText, image, link, description, itemCount, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [catId, title, buttonText, image || null, link, description || null, itemCount || 0, sortOrder || 0]
      );

      invalidateCache('categories');
      return res.status(201).json({ success: true, data: { id: catId } });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─── PUT /api/categories/:id ──────────────────────────────────────────────
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, buttonText, image, link, description, itemCount, sortOrder } = req.body;

    const existing = await queryOne('SELECT id FROM categories WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found' });

    const updates = [];
    const vals = [];
    if (title !== undefined)       { updates.push('title = ?');       vals.push(title); }
    if (buttonText !== undefined)  { updates.push('buttonText = ?');  vals.push(buttonText); }
    if (image !== undefined)       { updates.push('image = ?');       vals.push(image); }
    if (link !== undefined)        { updates.push('link = ?');        vals.push(link); }
    if (description !== undefined) { updates.push('description = ?'); vals.push(description); }
    if (itemCount !== undefined)   { updates.push('itemCount = ?');   vals.push(itemCount); }
    if (sortOrder !== undefined)   { updates.push('sortOrder = ?');   vals.push(sortOrder); }

    if (updates.length) {
      await execute(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, [...vals, id]);
    }

    invalidateCache('categories');
    return res.json({ success: true, message: 'Category updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE /api/categories/:id ───────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
    invalidateCache('categories');
    return res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
