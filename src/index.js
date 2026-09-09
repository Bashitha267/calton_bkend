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

// Trust reverse proxy headers (CloudLinux / LiteSpeed / Nginx / Hostinger)
app.set('trust proxy', 1);

// ─── Security headers ─────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image serving
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────
const configuredOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim().replace(/\/$/, '')) // strip trailing slashes
  .filter(Boolean);

const explicitOrigins = [
  'https://carltonvalley.com.au',
  'https://www.carltonvalley.com.au',
  'http://carltonvalley.com.au',
  'http://www.carltonvalley.com.au',
  'https://lightyellow-skunk-289163.hostingersite.com',
  'https://darkturquoise-swan-425639.hostingersite.com',
  'https://darkgoldenrod-wildcat-620933.hostingersite.com',
];

function isOriginAllowed(origin) {
  // Allow non-browser requests (curl, Postman, server-to-server, SSR)
  if (!origin) return true;

  const normalized = origin.trim().replace(/\/$/, '').toLowerCase();

  // Exact match from ALLOWED_ORIGINS env or explicit known domains
  if (
    configuredOrigins.some(o => o.toLowerCase() === normalized) ||
    configuredOrigins.includes('*') ||
    explicitOrigins.some(o => o.toLowerCase() === normalized)
  ) {
    return true;
  }

  // Allow carltonvalley.com.au and any subdomain (e.g. www, api, admin)
  if (/^https?:\/\/([a-z0-9-]+\.)*carltonvalley\.(com|com\.au)$/i.test(normalized)) return true;

  // Allow all Hostinger temporary / preview domains (*.hostingersite.com)
  if (/^https?:\/\/[a-z0-9-]+\.hostingersite\.com$/i.test(normalized)) return true;

  // Allow localhost / local network development on any port
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;

  return false;
}

const allowedCorsHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'Cache-Control',
  'cache-control',
  'Pragma',
  'pragma',
  'Expires',
  'expires',
  'X-Cache',
  'Range',
  'User-Agent',
];

const corsOptions = {
  origin(origin, cb) {
    if (isOriginAllowed(origin)) {
      return cb(null, true);
    }
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    cb(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: allowedCorsHeaders,
  exposedHeaders: ['Content-Range', 'X-Cache', 'Cache-Control'],
  optionsSuccessStatus: 200, // For legacy browser compatibility
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Explicit preflight fallback handler
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    const reqHeaders = req.headers['access-control-request-headers'];
    res.setHeader('Access-Control-Allow-Headers', reqHeaders || allowedCorsHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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

// ─── Rate limiting — generous limits so admin and store operations never 429 ─
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 500, // 500 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Auth route limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// ─── Static file serving for uploaded images ──────────────────────────────
const { UPLOAD_DIR } = require('./middleware/upload');

// Automatically migrate files from legacy process.cwd()/uploads if Hostinger previously stored them there
try {
  const legacyDir = path.resolve(process.cwd(), 'uploads');
  if (path.resolve(legacyDir) !== path.resolve(UPLOAD_DIR) && fs.existsSync(legacyDir)) {
    const copyRecursive = (src, dest) => {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true, mode: 0o755 });
      const items = fs.readdirSync(src, { withFileTypes: true });
      for (const item of items) {
        const sPath = path.join(src, item.name);
        const dPath = path.join(dest, item.name);
        if (item.isDirectory()) {
          copyRecursive(sPath, dPath);
        } else if (!fs.existsSync(dPath)) {
          fs.copyFileSync(sPath, dPath);
          console.log(`[Uploads Migration] Migrated file: ${sPath} -> ${dPath}`);
        }
      }
    };
    copyRecursive(legacyDir, UPLOAD_DIR);
  }
} catch (migErr) {
  console.warn('[Uploads Migration] Notice:', migErr.message);
}

// 1. Primary static serving via express.static
app.use(
  '/api/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '7d', // browser caches images for 7 days
    etag: true,
    lastModified: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// 2. Explicit fallback route for /api/uploads/* to guarantee delivery even if express.static misses
app.get('/api/uploads/*', (req, res, next) => {
  try {
    const rawPath = req.params[0] || '';
    const cleanSubPath = decodeURIComponent(rawPath).replace(/^\/+/, '');
    if (!cleanSubPath) {
      return res.status(404).json({ success: false, message: 'No file path specified' });
    }

    // Guard against directory traversal
    const safeSubPath = path.normalize(cleanSubPath).replace(/^(\.\.[\/\\])+/, '');

    const candidatePaths = [
      path.join(UPLOAD_DIR, safeSubPath),
      path.resolve(__dirname, '../uploads', safeSubPath),
      path.resolve(__dirname, '../../uploads', safeSubPath),
      path.resolve(process.cwd(), 'uploads', safeSubPath),
      path.resolve(process.cwd(), safeSubPath),
    ];

    for (const testPath of candidatePaths) {
      if (fs.existsSync(testPath)) {
        try {
          const stat = fs.statSync(testPath);
          if (stat.isFile()) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            return res.sendFile(path.resolve(testPath));
          }
        } catch (e) {
          // continue checking other candidates
        }
      }
    }

    console.warn(`[Uploads 404] File not found: "${safeSubPath}". Checked candidate paths:\n  - ${candidatePaths.join('\n  - ')}`);
    return res.status(404).json({
      success: false,
      message: `File "${safeSubPath}" not found on server`,
    });
  } catch (err) {
    console.error('[Uploads Error]', err);
    return next(err);
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/users',           require('./routes/users'));
app.use('/api/products',        require('./routes/products'));
app.use('/api/orders',          require('./routes/orders'));
app.use('/api/categories',      require('./routes/categories'));
app.use('/api/reviews',         require('./routes/reviews'));
app.use('/api/dashboard',           require('./routes/dashboard'));
app.use('/api/homepage-videos',     require('./routes/homepageVideos'));
app.use('/api/community-spotlight', require('./routes/communitySpotlight'));
app.use('/api/analytics',           require('./routes/analytics'));

// ─── Ping check ───────────────────────────────────────────────────────────
app.get(['/ping', '/api/ping'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, message: 'success' });
});

// ─── Database connection test ─────────────────────────────────────────────
app.get(['/trydb', '/api/trydb'], async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { pool } = require('./config/db');
    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT 1 + 1 AS solution, NOW() AS serverTime, DATABASE() AS databaseName');
    conn.release();

    res.status(200).json({
      success: true,
      message: 'Database connected successfully',
      database: rows[0]?.databaseName || process.env.DB_NAME,
      serverTime: rows[0]?.serverTime,
      testResult: rows[0]?.solution,
    });
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection error',
      error: error.message,
      code: error.code || 'DB_ERROR',
      details: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
      },
    });
  }
});

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
