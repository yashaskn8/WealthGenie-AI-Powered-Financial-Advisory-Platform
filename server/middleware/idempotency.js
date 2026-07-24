import { getCache, setCache, setCacheNX, delCache, redisAvailable } from '../config/redis.js';
import IdempotencyKey from '../models/IdempotencyKey.js';

// ARCHITECTURE: No in-memory Map. All idempotency state lives in shared infra.
// Primary: Redis (fast, atomic SET NX). Fallback: MongoDB IdempotencyKey collection.
// When BOTH are unavailable, idempotency protection is bypassed (logged).

/**
 * Idempotency Key middleware for preventing duplicate form submissions and double writes.
 * Supports a short TTL (5 minutes default) for successful responses.
 * Uses atomic SET NX (Redis) or findOneAndUpdate upsert (MongoDB) to prevent race conditions.
 *
 * STATELESS: All state is stored in shared Redis or MongoDB. No per-process fallback.
 */
export const idempotency = (ttlSeconds = 300) => {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key) {
      return next();
    }

    // Standardize key by user (to prevent key collision between different users)
    const userId = req.user?.userId || 'anonymous';
    const cacheKey = `idemp:${userId}:${key}`;

    try {
      if (redisAvailable) {
        return handleRedisIdempotency(req, res, next, cacheKey, ttlSeconds);
      }
      // Fallback: MongoDB-backed idempotency
      return handleMongoIdempotency(req, res, next, cacheKey, ttlSeconds);
    } catch (err) {
      console.warn('[Idempotency] Middleware failed (proceeding without safety):', err.message);
      next();
    }
  };
};

/**
 * Redis-backed idempotency using atomic SET NX.
 */
async function handleRedisIdempotency(req, res, next, cacheKey, ttlSeconds) {
  // Attempt atomic lock: SET key "LOCK" NX EX 10
  const acquired = await setCacheNX(cacheKey, 'LOCK', 10);

  if (!acquired) {
    const cached = await getCache(cacheKey);

    if (!cached || cached === 'LOCK') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A duplicate request is already in progress. Please wait.'
      });
    }

    // Return original cached response
    res.status(cached.status);
    if (cached.headers) {
      for (const [hk, hv] of Object.entries(cached.headers)) {
        res.setHeader(hk, hv);
      }
    }
    res.setHeader('X-Cache-Lookup', 'HIT - Idempotent');
    return res.send(cached.body);
  }

  // Lock acquired — intercept res.send to save response
  const originalSend = res.send;
  res.send = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const responseData = {
        status: res.statusCode,
        headers: { 'content-type': res.getHeader('content-type') },
        body: body
      };
      setCache(cacheKey, responseData, ttlSeconds).catch(() => {});
    } else {
      delCache(cacheKey).catch(() => {});
    }
    return originalSend.apply(this, arguments);
  };

  next();
}

/**
 * MongoDB-backed idempotency fallback using findOneAndUpdate with upsert.
 * Uses the IdempotencyKey model with a TTL index for automatic cleanup.
 */
async function handleMongoIdempotency(req, res, next, cacheKey, ttlSeconds) {
  try {
    // Attempt atomic lock via insert — MongoDB E11000 duplicate key error = already exists
    await IdempotencyKey.create({ _id: cacheKey, status: 'LOCK', response: null });

    // Lock acquired — intercept res.send to save response in MongoDB BEFORE sending
    const originalSend = res.send;
    res.send = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const responseData = {
          status: res.statusCode,
          headers: { 'content-type': res.getHeader('content-type') },
          body: body
        };
        // Await write to MongoDB before sending response to ensure
        // subsequent requests see the cached response (not LOCK).
        IdempotencyKey.findByIdAndUpdate(cacheKey, {
          status: 'DONE',
          response: responseData
        }).catch(() => {}).finally(() => {
          originalSend.call(res, body);
        });
        return res;
      } else {
        IdempotencyKey.findByIdAndDelete(cacheKey).catch(() => {});
        return originalSend.apply(this, arguments);
      }
    };

    next();
  } catch (err) {
    if (err.code === 11000) {
      // Document already exists — check if it has a cached response
      const doc = await IdempotencyKey.findById(cacheKey).lean();

      if (!doc || doc.status === 'LOCK') {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A duplicate request is already in progress. Please wait.'
        });
      }

      // Return cached response
      const cached = doc.response;
      res.status(cached.status);
      if (cached.headers) {
        for (const [hk, hv] of Object.entries(cached.headers)) {
          res.setHeader(hk, hv);
        }
      }
      res.setHeader('X-Cache-Lookup', 'HIT - Idempotent');
      return res.send(cached.body);
    }

    console.warn('[Idempotency] MongoDB fallback failed (proceeding without safety):', err.message);
    next();
  }
}
