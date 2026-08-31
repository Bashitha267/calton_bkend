/**
 * Carlton Valley E-Commerce — Express API Server
 * Optimised for Hostinger shared Node.js hosting
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// ─── Optimise keep-alive for lower ping latency ───────────────────────────
http.globalAgent.keepAlive = true;
http.globalAgent.maxSockets = 10;

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image serving
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin(origin, cb) {
      // Allow requests with no origin (curl, Postman, SSR)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Compression — reduces JSON payload ~70% ─────────────────────────────
app.use(
  compression({
    level: 6, // balanced speed vs ratio for shared hosting CPU
    threshold: 1024, // only compress responses > 1KB
  })
);

// ─── Body parsing — limit JSON body to 50MB for product data ─────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Rate limiting — protect against abuse on shared hosting ─────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ─── Static file serving for uploaded images ──────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(
  '/api/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '7d', // browser caches images for 7 days
    etag: true,
    lastModified: true,
    // Set immutable Cache-Control for images (they have unique timestamped filenames)
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    },
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/dashboard',  require('./routes/dashboard'));

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, status: 'ok', uptime: process.uptime(), env: process.env.NODE_ENV });
});

// ─── 404 handler ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 50}MB.`,
    });
  }
  // CORS error
  if (err.message && err.message.startsWith('CORS policy')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start server ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;

const server = http.createServer(app);

// Keep-alive timeout slightly higher than nginx/proxy default (65s)
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout   = 66 * 1000;

server.listen(PORT, () => {
  console.log(`\n🚀 Carlton Valley API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Uploads dir : ${UPLOAD_DIR}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = app;
