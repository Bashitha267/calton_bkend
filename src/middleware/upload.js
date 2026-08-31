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

module.exports = { upload, buildImageUrl, UPLOAD_DIR };
