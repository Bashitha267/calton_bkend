const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { pool, query, queryOne, execute } = require('../config/db');
const { videoUpload, buildVideoUrl, UPLOAD_DIR } = require('../middleware/upload');

// Default fallback videos in case table doesn't exist yet or during DB cold start
const DEFAULT_VIDEOS = [
  {
    id: 'vid-hero',
    sectionKey: 'hero',
    title: 'Hero Background Video',
    subtitle: 'Autumn / Winter 2026 Collection',
    description: 'Main fullscreen loop background video displayed in the top hero section.',
    videoUrl: '/hero1.mp4',
    posterUrl: '',
    isActive: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'vid-featured',
    sectionKey: 'featured',
    title: 'Featured Editorial Video',
    subtitle: 'EDITORIAL // VOL. 01',
    description: 'Portrait aspect ratio editorial story video showcasing luxury tailoring and natural textiles.',
    videoUrl: '/hero2.mp4',
    posterUrl: '',
    isActive: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let inMemoryVideos = [...DEFAULT_VIDEOS];

// Ensure table exists on startup (graceful fallback if permissions or table issues)
async function initTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS homepage_videos (
        id VARCHAR(50) NOT NULL,
        sectionKey VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255) DEFAULT NULL,
        description TEXT DEFAULT NULL,
        videoUrl VARCHAR(500) NOT NULL,
        posterUrl VARCHAR(500) DEFAULT NULL,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_sectionKey (sectionKey)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const rows = await query('SELECT COUNT(*) AS cnt FROM homepage_videos');
    if (rows && rows[0] && rows[0].cnt === 0) {
      for (const v of DEFAULT_VIDEOS) {
        await execute(
          'INSERT INTO homepage_videos (id, sectionKey, title, subtitle, description, videoUrl, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [v.id, v.sectionKey, v.title, v.subtitle, v.description, v.videoUrl, v.isActive]
        );
      }
    }
  } catch (err) {
    console.warn('[HomepageVideos] Notice during table auto-init:', err.message);
  }
}

initTable().catch(() => {});

// ─── GET /api/homepage-videos ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM homepage_videos ORDER BY createdAt ASC');
    if (rows && rows.length > 0) {
      return res.json({ success: true, videos: rows });
    }
    // Fallback if table is empty
    return res.json({ success: true, videos: inMemoryVideos });
  } catch (err) {
    console.warn('[HomepageVideos] Error reading DB, using fallback:', err.message);
    return res.json({ success: true, videos: inMemoryVideos });
  }
});

// ─── GET /api/homepage-videos/:sectionKey ──────────────────────────────────
router.get('/:sectionKey', async (req, res) => {
  const { sectionKey } = req.params;
  try {
    const row = await queryOne(
      'SELECT * FROM homepage_videos WHERE sectionKey = ? OR id = ? LIMIT 1',
      [sectionKey, sectionKey]
    );
    if (row) {
      return res.json({ success: true, video: row });
    }
    const mem = inMemoryVideos.find(v => v.sectionKey === sectionKey || v.id === sectionKey);
    if (mem) {
      return res.json({ success: true, video: mem });
    }
    return res.status(404).json({ success: false, message: `Video section ${sectionKey} not found` });
  } catch (err) {
    const mem = inMemoryVideos.find(v => v.sectionKey === sectionKey || v.id === sectionKey);
    if (mem) return res.json({ success: true, video: mem });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/homepage-videos/upload ──────────────────────────────────────
// Uploads a video file directly to uploads/videos/
router.post('/upload', videoUpload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No video file provided' });
  }

  const videoUrl = buildVideoUrl(req, req.file.path);
  return res.json({
    success: true,
    message: 'Video uploaded successfully to uploads/ folder',
    videoUrl,
    filename: req.file.filename,
    sizeBytes: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// ─── PUT /api/homepage-videos/:id ──────────────────────────────────────────
// Update video section details (title, subtitle, description, videoUrl, isActive)
// Supports multipart with file upload OR JSON body
router.put('/:id', videoUpload.single('video'), async (req, res) => {
  const { id } = req.params;
  let videoUrl = req.body.videoUrl;

  // If a file was uploaded in this request, use its URL
  if (req.file) {
    videoUrl = buildVideoUrl(req, req.file.path);
  }

  const title = req.body.title;
  const subtitle = req.body.subtitle !== undefined ? req.body.subtitle : null;
  const description = req.body.description !== undefined ? req.body.description : null;
  const isActive = req.body.isActive !== undefined ? (req.body.isActive === 'false' || req.body.isActive === 0 ? 0 : 1) : 1;

  try {
    // Check if section exists in DB
    let existing = await queryOne(
      'SELECT * FROM homepage_videos WHERE id = ? OR sectionKey = ? LIMIT 1',
      [id, id]
    );

    if (existing) {
      const finalVideoUrl = videoUrl || existing.videoUrl;
      const finalTitle = title !== undefined ? title : existing.title;
      const finalSubtitle = subtitle !== undefined ? subtitle : existing.subtitle;
      const finalDescription = description !== undefined ? description : existing.description;

      await execute(
        `UPDATE homepage_videos 
         SET title = ?, subtitle = ?, description = ?, videoUrl = ?, isActive = ?, updatedAt = NOW()
         WHERE id = ?`,
        [finalTitle, finalSubtitle, finalDescription, finalVideoUrl, isActive, existing.id]
      );

      const updated = await queryOne('SELECT * FROM homepage_videos WHERE id = ?', [existing.id]);

      // Update in-memory fallback too
      const idx = inMemoryVideos.findIndex(v => v.id === existing.id || v.sectionKey === existing.sectionKey);
      if (idx !== -1) {
        inMemoryVideos[idx] = { ...inMemoryVideos[idx], ...updated };
      }

      return res.json({
        success: true,
        message: 'Homepage video section updated successfully',
        video: updated,
      });
    }

    // If not in DB yet, insert it
    const newId = id.startsWith('vid-') ? id : `vid-${id}`;
    const sectionKey = req.body.sectionKey || id.replace('vid-', '');
    const newVideo = {
      id: newId,
      sectionKey,
      title: title || 'Homepage Video Section',
      subtitle: subtitle || '',
      description: description || '',
      videoUrl: videoUrl || '/hero1.mp4',
      isActive,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    try {
      await execute(
        'INSERT INTO homepage_videos (id, sectionKey, title, subtitle, description, videoUrl, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newVideo.id, newVideo.sectionKey, newVideo.title, newVideo.subtitle, newVideo.description, newVideo.videoUrl, newVideo.isActive]
      );
    } catch (insertErr) {
      console.warn('[HomepageVideos] Insert failed, updating memory:', insertErr.message);
    }

    inMemoryVideos.push(newVideo);
    return res.json({
      success: true,
      message: 'Homepage video section created successfully',
      video: newVideo,
    });
  } catch (err) {
    console.error('Error updating homepage video:', err);

    // If DB fails, update in-memory
    const idx = inMemoryVideos.findIndex(v => v.id === id || v.sectionKey === id);
    if (idx !== -1) {
      inMemoryVideos[idx] = {
        ...inMemoryVideos[idx],
        title: title || inMemoryVideos[idx].title,
        subtitle: subtitle !== undefined ? subtitle : inMemoryVideos[idx].subtitle,
        description: description !== undefined ? description : inMemoryVideos[idx].description,
        videoUrl: videoUrl || inMemoryVideos[idx].videoUrl,
        isActive,
        updatedAt: new Date().toISOString(),
      };
      return res.json({
        success: true,
        message: 'Updated in memory fallback (DB update failed)',
        video: inMemoryVideos[idx],
        dbNotice: err.message,
      });
    }

    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/homepage-videos/reset ──────────────────────────────────────
router.post('/reset', async (req, res) => {
  try {
    for (const v of DEFAULT_VIDEOS) {
      await execute(
        'UPDATE homepage_videos SET videoUrl = ?, title = ?, updatedAt = NOW() WHERE sectionKey = ?',
        [v.videoUrl, v.title, v.sectionKey]
      );
    }
    inMemoryVideos = [...DEFAULT_VIDEOS];
    return res.json({ success: true, message: 'Videos reset to default /hero1.mp4 and /hero2.mp4' });
  } catch (err) {
    inMemoryVideos = [...DEFAULT_VIDEOS];
    return res.json({ success: true, message: 'Reset completed (in-memory)', error: err.message });
  }
});

module.exports = router;
