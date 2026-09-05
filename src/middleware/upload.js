const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 50;

// Ensure base uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Dynamic disk storage — saves images under:
 *   uploads/<productId>/<colorId>/
 *
 * Expects req.body.productId and req.body.colorId to be populated
 * (they should come in the same multipart/form-data request).
 */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    // productId and colorId come from form fields in the same request
    const productId = (req.body.productId || req.params.id || 'unknown').replace(/[^a-z0-9\-_]/gi, '_');
    const colorId   = (req.body.colorId   || 'default').replace(/[^a-z0-9\-_]/gi, '_');
    const dir = path.join(UPLOAD_DIR, productId, colorId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    // timestamp + random suffix for uniqueness, no spaces
    const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    cb(null, name);
  },
});

// Only allow image MIME types
function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, GIF, AVIF`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, // 50 MB
    files: 6, // max 6 images per color (matching ProductColorVariant.images)
  },
});

const videoDir = path.join(UPLOAD_DIR, 'videos');
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

const videoStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, videoDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    const sectionKey = (req.body.sectionKey || req.params.sectionKey || 'home').replace(/[^a-z0-9\-_]/gi, '_');
    const name = `vid_${sectionKey}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    cb(null, name);
  },
});

function videoFileFilter(req, file, cb) {
  const allowedMime = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
  ];
  const allowedExt = ['.mp4', '.webm', '.mov', '.ogg', '.mkv'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported video format: ${file.mimetype}. Allowed: MP4, WebM, MOV, OGG`));
  }
}

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max for videos
    files: 1,
  },
});

/**
 * Build a public-facing URL for a saved upload file.
 * e.g.  uploads/prod-1/col-black/img_123.jpg  →  /api/uploads/prod-1/col-black/img_123.jpg
 */
function buildImageUrl(req, filePath) {
  // Convert absolute path to relative from UPLOAD_DIR
  const relative = path.relative(UPLOAD_DIR, filePath).replace(/\\/g, '/');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/api/uploads/${relative}`;
}

function buildVideoUrl(req, filePath) {
  const relative = path.relative(UPLOAD_DIR, filePath).replace(/\\/g, '/');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/api/uploads/${relative}`;
}

module.exports = {
  upload,
  videoUpload,
  buildImageUrl,
  buildVideoUrl,
  UPLOAD_DIR,
};
