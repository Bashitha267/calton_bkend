const { LRUCache } = require('lru-cache');

/**
 * In-process LRU cache for GET responses.
 * On Hostinger shared hosting, this avoids hitting MySQL on every product request.
 *
 * Cache is intentionally small (100 entries) to respect shared-hosting memory limits.
 * TTL: 60 seconds.  Stale: revalidate in background (stale-while-revalidate pattern).
 */
const lruCache = new LRUCache({
  max: 100,          // max 100 different cache keys
  ttl: 1000 * 60,   // 60 seconds TTL
  allowStale: false,
  updateAgeOnGet: false,
});

/**
 * Middleware factory — caches JSON responses for GET requests.
 * Usage: router.get('/products', cacheMiddleware('products'), handler)
 *
 * @param {string} keyPrefix — prefix for the cache key (e.g. 'products', 'categories')
 */
function cacheMiddleware(keyPrefix) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const cacheKey = `${keyPrefix}:${req.originalUrl}`;
    const cached = lruCache.get(cacheKey);

    if (cached) {
      // Serve from cache — set Hostinger-friendly cache headers
      res.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Cache': 'HIT',
        'Content-Type': 'application/json',
      });
      return res.json(cached);
    }

    // Intercept res.json to store in cache
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        lruCache.set(cacheKey, body);
      }
      res.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      });
      return originalJson(body);
    };

    next();
  };
}

/**
 * Invalidate all cache entries whose key starts with the given prefix.
 * Call this after any write (POST/PUT/DELETE) to products or categories.
 */
function invalidateCache(keyPrefix) {
  for (const key of lruCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      lruCache.delete(key);
    }
  }
}

module.exports = { cacheMiddleware, invalidateCache, lruCache };
