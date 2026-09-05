const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { query, queryOne, execute, withTransaction } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { upload, buildImageUrl, UPLOAD_DIR } = require('../middleware/upload');
const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

// ─── GET /api/products ────────────────────────────────────────────────────
// Public — returns all products with colors, images, sizes
router.get('/', cacheMiddleware('products'), async (req, res) => {
  try {
    const { category, inStock, isNewArrival, isComingSoon, search } = req.query;

    let sql = `SELECT p.*, pd.header as desc_header, pd.description, pd.fit, pd.fabric, pd.details
               FROM products p
               LEFT JOIN product_descriptions pd ON pd.productId = p.id
               WHERE 1=1`;
    const params = [];

    if (category)      { sql += ' AND p.category = ?';    params.push(category); }
    if (inStock)       { sql += ' AND p.inStock = ?';     params.push(inStock === 'true' ? 1 : 0); }
    if (isNewArrival)  { sql += ' AND p.isNewArrival = 1'; }
    if (isComingSoon)  { sql += ' AND p.isComingSoon = 1'; }
    if (search)        { sql += ' AND (p.name LIKE ? OR p.category LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    sql += ' ORDER BY p.createdAt DESC';

    const products = await query(sql, params);
    if (!products.length) return res.json({ success: true, data: [] });

    const productIds = products.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');

    // Batch-fetch related data to avoid N+1 queries
    const [colors, sizes, shippingSections, shippingPoints] = await Promise.all([
      query(`SELECT c.*, ci.imageUrl, ci.sortOrder, ci.id as imageId
             FROM product_colors c
             LEFT JOIN product_color_images ci ON ci.colorId = c.id
             WHERE c.productId IN (${placeholders})
             ORDER BY c.productId, ci.sortOrder`, productIds),
      query(`SELECT * FROM product_sizes WHERE productId IN (${placeholders}) ORDER BY productId, sortOrder`, productIds),
      query(`SELECT * FROM shipping_sections WHERE productId IN (${placeholders}) ORDER BY productId`, productIds),
      query(`SELECT sp.*, ss.productId FROM shipping_points sp
             JOIN shipping_sections ss ON ss.id = sp.sectionId
             WHERE ss.productId IN (${placeholders})
             ORDER BY sp.sectionId, sp.sortOrder`, productIds),
    ]);

    // Build color map: colorId → { ...color, images: [] }
    const colorMap = {};
    for (const row of colors) {
      if (!colorMap[row.id]) {
        colorMap[row.id] = {
          id: row.id,
          productId: row.productId,
          name: row.name,
          hex: row.hex,
          swatchImage: row.swatchImage,
          images: [],
        };
      }
      if (row.imageUrl) {
        colorMap[row.id].images.push(row.imageUrl);
      }
    }

    // Build section map: sectionId → { ...section, points: [] }
    const sectionMap = {};
    for (const s of shippingSections) {
      sectionMap[s.id] = { id: s.id, productId: s.productId, header: s.header, points: [] };
    }
    for (const sp of shippingPoints) {
      if (sectionMap[sp.sectionId]) sectionMap[sp.sectionId].points.push(sp.point);
    }

    // Assemble products
    const assembled = products.map(p => {
      const productColors = Object.values(colorMap).filter(c => c.productId === p.id);
      const productSizes  = sizes.filter(s => s.productId === p.id).map(s => s.size);
      const productSections = Object.values(sectionMap).filter(s => s.productId === p.id)
        .map(({ id: _id, productId: _pid, ...rest }) => rest);

      return {
        id: p.id,
        name: p.name,
        priceAUD: parseFloat(p.priceAUD),
        category: p.category,
        badge: p.badge,
        inStock: Boolean(p.inStock),
        preOrder: Boolean(p.preOrder),
        isNewArrival: Boolean(p.isNewArrival),
        isComingSoon: Boolean(p.isComingSoon),
        rating: parseFloat(p.rating),
        reviewCount: p.reviewCount,
        createdAt: p.createdAt,
        sizes: productSizes,
        colors: productColors.map(({ productId: _, ...c }) => c),
        descriptionSection: {
          header: p.desc_header || p.name,
          description: p.description || '',
          fit: p.fit || '',
          fabric: p.fabric || '',
          details: p.details || '',
        },
        shippingSections: productSections,
      };
    });

    return res.json({ success: true, data: assembled });
  } catch (err) {
    console.error('GET /products error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────
router.get('/:id', cacheMiddleware('product'), async (req, res) => {
  try {
    const { id } = req.params;
    const product = await queryOne(
      `SELECT p.*, pd.header as desc_header, pd.description, pd.fit, pd.fabric, pd.details
       FROM products p
       LEFT JOIN product_descriptions pd ON pd.productId = p.id
       WHERE p.id = ?`,
      [id]
    );

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const [colors, sizes, shippingSections, shippingPoints, reviews] = await Promise.all([
      query(`SELECT c.*, ci.imageUrl, ci.sortOrder
             FROM product_colors c
             LEFT JOIN product_color_images ci ON ci.colorId = c.id
             WHERE c.productId = ? ORDER BY ci.sortOrder`, [id]),
      query('SELECT size FROM product_sizes WHERE productId = ? ORDER BY sortOrder', [id]),
      query('SELECT * FROM shipping_sections WHERE productId = ?', [id]),
      query(`SELECT sp.* FROM shipping_points sp
             JOIN shipping_sections ss ON ss.id = sp.sectionId
             WHERE ss.productId = ? ORDER BY sp.sectionId, sp.sortOrder`, [id]),
      query('SELECT * FROM reviews WHERE productId = ? ORDER BY date DESC', [id]),
    ]);

    // Build colors
    const colorMap = {};
    for (const row of colors) {
      if (!colorMap[row.id]) {
        colorMap[row.id] = { id: row.id, name: row.name, hex: row.hex, swatchImage: row.swatchImage, images: [] };
      }
      if (row.imageUrl) colorMap[row.id].images.push(row.imageUrl);
    }

    // Build shipping sections
    const sectionMap = {};
    for (const s of shippingSections) sectionMap[s.id] = { header: s.header, points: [] };
    for (const sp of shippingPoints) {
      if (sectionMap[sp.sectionId]) sectionMap[sp.sectionId].points.push(sp.point);
    }

    return res.json({
      success: true,
      data: {
        id: product.id,
        name: product.name,
        priceAUD: parseFloat(product.priceAUD),
        category: product.category,
        badge: product.badge,
        inStock: Boolean(product.inStock),
        preOrder: Boolean(product.preOrder),
        isNewArrival: Boolean(product.isNewArrival),
        isComingSoon: Boolean(product.isComingSoon),
        rating: parseFloat(product.rating),
        reviewCount: product.reviewCount,
        createdAt: product.createdAt,
        sizes: sizes.map(s => s.size),
        colors: Object.values(colorMap),
        descriptionSection: {
          header: product.desc_header || product.name,
          description: product.description || '',
          fit: product.fit || '',
          fabric: product.fabric || '',
          details: product.details || '',
        },
        shippingSections: Object.values(sectionMap),
        reviews: reviews.map(r => ({
          id: r.id,
          reviewerName: r.reviewerName,
          verified: Boolean(r.verified),
          date: r.date,
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          itemSize: r.itemSize,
          itemColor: r.itemColor,
          mediaType: r.mediaType,
          mediaUrl: r.mediaUrl,
          mediaThumbnail: r.mediaThumbnail,
          status: r.status,
        })),
      },
    });
  } catch (err) {
    console.error('GET /products/:id error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/products ───────────────────────────────────────────────────
// Admin only — creates a product (without images; images added via separate upload endpoint)
router.post(
  '/',
  requireAuth,
  requireAdmin,
  [
    body('name').trim().notEmpty(),
    body('priceAUD').isFloat({ min: 0 }),
    body('category').trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const {
        id,
        name, priceAUD, category, badge,
        inStock = true, preOrder = false,
        isNewArrival = false, isComingSoon = false,
        sizes = [],
        colors = [],
        descriptionSection = {},
        shippingSections = [],
      } = req.body;

      const { v4: uuidv4 } = require('uuid');
      const productId = id || ('prod-' + uuidv4().replace(/-/g, '').slice(0, 12));

      await withTransaction(async (conn) => {
        // Insert product
        await conn.execute(
          `INSERT INTO products (id, name, priceAUD, category, badge, inStock, preOrder, isNewArrival, isComingSoon, rating, reviewCount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
          [productId, name, priceAUD, category, badge || null, inStock ? 1 : 0, preOrder ? 1 : 0, isNewArrival ? 1 : 0, isComingSoon ? 1 : 0]
        );

        // Description
        if (descriptionSection) {
          await conn.execute(
            'INSERT INTO product_descriptions (productId, header, description, fit, fabric, details) VALUES (?, ?, ?, ?, ?, ?)',
            [productId, descriptionSection.header || name, descriptionSection.description || '', descriptionSection.fit || '', descriptionSection.fabric || '', descriptionSection.details || '']
          );
        }

        // Sizes (safe sanitized ENUM / string handling)
        const validSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
        const cleanedSizes = (Array.isArray(sizes) ? sizes : [])
          .map(s => String(s || '').trim().toUpperCase())
          .filter(Boolean);

        for (let i = 0; i < cleanedSizes.length; i++) {
          const sizeVal = validSizes.includes(cleanedSizes[i]) ? cleanedSizes[i] : 'M';
          await conn.execute('INSERT INTO product_sizes (productId, size, sortOrder) VALUES (?, ?, ?)', [productId, sizeVal, i]);
        }

        // Colors (images uploaded separately or passed as URLs)
        for (const color of (colors || [])) {
          const colorId = color.id || ('col-' + uuidv4().replace(/-/g, '').slice(0, 8));
          await conn.execute(
            'INSERT INTO product_colors (id, productId, name, hex, swatchImage) VALUES (?, ?, ?, ?, ?)',
            [colorId, productId, color.name || 'Standard', color.hex || null, color.swatchImage || null]
          );
          if (color.images && color.images.length) {
            for (let i = 0; i < color.images.length; i++) {
              if (color.images[i]) {
                await conn.execute(
                  'INSERT INTO product_color_images (colorId, imageUrl, sortOrder) VALUES (?, ?, ?)',
                  [colorId, color.images[i], i]
                );
              }
            }
          }
        }

        // Shipping sections
        for (const section of (shippingSections || [])) {
          const [sResult] = await conn.execute(
            'INSERT INTO shipping_sections (productId, header) VALUES (?, ?)',
            [productId, section.header || 'Shipping Information']
          );
          const sectionId = sResult.insertId;
          const points = Array.isArray(section.points) ? section.points : [];
          for (let i = 0; i < points.length; i++) {
            if (points[i]) {
              await conn.execute(
                'INSERT INTO shipping_points (sectionId, point, sortOrder) VALUES (?, ?, ?)',
                [sectionId, points[i], i]
              );
            }
          }
        }
      });

      invalidateCache('products');
      invalidateCache('product');

      return res.status(201).json({ success: true, data: { id: productId } });
    } catch (err) {
      console.error('POST /products error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  }
);

// ─── PUT /api/products/:id ────────────────────────────────────────────────
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT id FROM products WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    const {
      name, priceAUD, category, badge,
      inStock, preOrder, isNewArrival, isComingSoon,
      sizes, colors, descriptionSection, shippingSections,
    } = req.body;

    await withTransaction(async (conn) => {
      // Update core fields
      const updates = [];
      const vals = [];
      if (name !== undefined)        { updates.push('name = ?');        vals.push(name); }
      if (priceAUD !== undefined)    { updates.push('priceAUD = ?');    vals.push(priceAUD); }
      if (category !== undefined)    { updates.push('category = ?');    vals.push(category); }
      if (badge !== undefined)       { updates.push('badge = ?');       vals.push(badge); }
      if (inStock !== undefined)     { updates.push('inStock = ?');     vals.push(inStock ? 1 : 0); }
      if (preOrder !== undefined)    { updates.push('preOrder = ?');    vals.push(preOrder ? 1 : 0); }
      if (isNewArrival !== undefined){ updates.push('isNewArrival = ?');vals.push(isNewArrival ? 1 : 0); }
      if (isComingSoon !== undefined){ updates.push('isComingSoon = ?');vals.push(isComingSoon ? 1 : 0); }

      if (updates.length) {
        await conn.execute(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, [...vals, id]);
      }

      // Description
      if (descriptionSection) {
        await conn.execute('DELETE FROM product_descriptions WHERE productId = ?', [id]);
        await conn.execute(
          'INSERT INTO product_descriptions (productId, header, description, fit, fabric, details) VALUES (?, ?, ?, ?, ?, ?)',
          [id, descriptionSection.header || name || '', descriptionSection.description || '', descriptionSection.fit || '', descriptionSection.fabric || '', descriptionSection.details || '']
        );
      }

      // Sizes — replace all (safe sanitized ENUM / string handling)
      if (sizes !== undefined) {
        await conn.execute('DELETE FROM product_sizes WHERE productId = ?', [id]);
        const validSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
        const cleanedSizes = (Array.isArray(sizes) ? sizes : [])
          .map(s => String(s || '').trim().toUpperCase())
          .filter(Boolean);

        for (let i = 0; i < cleanedSizes.length; i++) {
          const sizeVal = validSizes.includes(cleanedSizes[i]) ? cleanedSizes[i] : 'M';
          await conn.execute('INSERT INTO product_sizes (productId, size, sortOrder) VALUES (?, ?, ?)', [id, sizeVal, i]);
        }
      }

      // Colors — replace all (images included as URLs)
      if (colors !== undefined) {
        const existingColors = await conn.execute('SELECT id FROM product_colors WHERE productId = ?', [id]);
        const existingColorIds = existingColors[0].map(c => c.id);
        for (const cid of existingColorIds) {
          await conn.execute('DELETE FROM product_color_images WHERE colorId = ?', [cid]);
        }
        await conn.execute('DELETE FROM product_colors WHERE productId = ?', [id]);

        const { v4: uuidv4 } = require('uuid');
        for (const color of (colors || [])) {
          const colorId = color.id || ('col-' + uuidv4().replace(/-/g, '').slice(0, 8));
          await conn.execute(
            'INSERT INTO product_colors (id, productId, name, hex, swatchImage) VALUES (?, ?, ?, ?, ?)',
            [colorId, id, color.name || 'Standard', color.hex || null, color.swatchImage || null]
          );
          if (color.images && color.images.length) {
            for (let i = 0; i < color.images.length; i++) {
              if (color.images[i]) {
                await conn.execute(
                  'INSERT INTO product_color_images (colorId, imageUrl, sortOrder) VALUES (?, ?, ?)',
                  [colorId, color.images[i], i]
                );
              }
            }
          }
        }
      }

      // Shipping sections — replace all
      if (shippingSections !== undefined) {
        const existingSections = await conn.execute('SELECT id FROM shipping_sections WHERE productId = ?', [id]);
        const sectionIds = existingSections[0].map(s => s.id);
        for (const sid of sectionIds) {
          await conn.execute('DELETE FROM shipping_points WHERE sectionId = ?', [sid]);
        }
        await conn.execute('DELETE FROM shipping_sections WHERE productId = ?', [id]);

        for (const section of (shippingSections || [])) {
          const [sResult] = await conn.execute(
            'INSERT INTO shipping_sections (productId, header) VALUES (?, ?)',
            [id, section.header || 'Shipping Information']
          );
          const sectionId = sResult.insertId;
          const points = Array.isArray(section.points) ? section.points : [];
          for (let i = 0; i < points.length; i++) {
            if (points[i]) {
              await conn.execute(
                'INSERT INTO shipping_points (sectionId, point, sortOrder) VALUES (?, ?, ?)',
                [sectionId, points[i], i]
              );
            }
          }
        }
      }
    });

    invalidateCache('products');
    invalidateCache('product');

    return res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    console.error('PUT /products/:id error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await queryOne('SELECT id FROM products WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    await withTransaction(async (conn) => {
      // Get color IDs first for image cleanup
      const [colorRows] = await conn.execute('SELECT id FROM product_colors WHERE productId = ?', [id]);
      for (const c of colorRows) {
        // Get image files
        const [imgRows] = await conn.execute('SELECT imageUrl FROM product_color_images WHERE colorId = ?', [c.id]);
        for (const img of imgRows) {
          // Delete local uploaded files if path points to uploads folder
          if (img.imageUrl && img.imageUrl.includes('/api/uploads/')) {
            const relativePath = img.imageUrl.split('/api/uploads/')[1];
            if (relativePath) {
              const filePath = path.join(UPLOAD_DIR, relativePath);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          }
        }
        await conn.execute('DELETE FROM product_color_images WHERE colorId = ?', [c.id]);
      }

      // Cascade deletes
      const [secRows] = await conn.execute('SELECT id FROM shipping_sections WHERE productId = ?', [id]);
      for (const s of secRows) {
        await conn.execute('DELETE FROM shipping_points WHERE sectionId = ?', [s.id]);
      }

      await conn.execute('DELETE FROM product_colors WHERE productId = ?', [id]);
      await conn.execute('DELETE FROM product_descriptions WHERE productId = ?', [id]);
      await conn.execute('DELETE FROM product_sizes WHERE productId = ?', [id]);
      await conn.execute('DELETE FROM shipping_sections WHERE productId = ?', [id]);
      await conn.execute('DELETE FROM reviews WHERE productId = ?', [id]);
      await conn.execute('DELETE FROM products WHERE id = ?', [id]);
    });

    // Clean up upload folder for this product
    const productUploadDir = path.join(UPLOAD_DIR, id);
    if (fs.existsSync(productUploadDir)) {
      fs.rmSync(productUploadDir, { recursive: true, force: true });
    }

    invalidateCache('products');
    invalidateCache('product');

    return res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/products/:id/colors/:colorId/images ────────────────────────
// Upload images for a specific color variant (multipart/form-data, field: images)
router.post(
  '/:id/colors/:colorId/images',
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    // Inject productId + colorId into body for multer storage
    req.body.productId = req.params.id;
    req.body.colorId   = req.params.colorId;
    next();
  },
  upload.array('images', 6),
  async (req, res) => {
    try {
      const { id: productId, colorId } = req.params;

      // Verify color exists
      const color = await queryOne('SELECT id FROM product_colors WHERE id = ? AND productId = ?', [colorId, productId]);
      if (!color) return res.status(404).json({ success: false, message: 'Color not found' });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'No images uploaded' });
      }

      // Get current image count to determine sort order start
      const [{ cnt }] = await query('SELECT COUNT(*) as cnt FROM product_color_images WHERE colorId = ?', [colorId]);

      const savedUrls = [];
      for (let i = 0; i < req.files.length; i++) {
        const fileUrl = buildImageUrl(req, req.files[i].path);
        await execute(
          'INSERT INTO product_color_images (colorId, imageUrl, sortOrder) VALUES (?, ?, ?)',
          [colorId, fileUrl, parseInt(cnt) + i]
        );
        savedUrls.push(fileUrl);
      }

      invalidateCache('products');
      invalidateCache('product');

      return res.status(201).json({ success: true, data: { imageUrls: savedUrls } });
    } catch (err) {
      console.error('Image upload error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  }
);

// ─── DELETE /api/products/:id/colors/:colorId/images ─────────────────────
// Delete a specific image by URL
router.delete('/:id/colors/:colorId/images', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id: productId, colorId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) return res.status(400).json({ success: false, message: 'imageUrl required' });

    await execute('DELETE FROM product_color_images WHERE colorId = ? AND imageUrl = ?', [colorId, imageUrl]);

    // Remove file from disk
    if (imageUrl.includes('/api/uploads/')) {
      const relativePath = imageUrl.split('/api/uploads/')[1];
      if (relativePath) {
        const filePath = path.join(UPLOAD_DIR, relativePath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    invalidateCache('products');
    invalidateCache('product');

    return res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
