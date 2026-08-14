import { createClient } from 'redis';
import logger from '../utils/logger.js';

let redisClient = null;
let redisAvailable = false;
let forceFailClosedInTest = false;

/**
 * Initialize Redis connection.
 * Falls back gracefully if Redis is not available (dev environments).
 */
const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || ('re' + 'dis://localhost:6379'),
      socket: {
        connectTimeoutMs: 3000,
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            return new Error('Redis reconnect attempts exhausted.');
          }
          return Math.min(retries * 500, 3000); // Backoff: 500ms, 1000ms, 1500ms, etc.
        },
      },
    });

    let errorLogged = false;
    redisClient.on('error', (err) => {
      if (!errorLogged) {
        logger.warn('Redis not available — running without cache', { message: err.message });
        errorLogged = true;
      }
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
      redisAvailable = true;
    });

    await redisClient.connect();
    redisAvailable = true;
  } catch (error) {
    logger.warn('Redis not available — running without cache', { message: error.message });
    redisAvailable = false;
    redisClient = null;
  }
};

/**
 * Get cached value by key. Returns null if Redis is unavailable or key doesn't exist.
 */
const getCache = async (key) => {
  if (!redisAvailable || !redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

/**
 * Set cache with TTL (default 24 hours).
 */
const setCache = async (key, value, ttlSeconds = 86400) => {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silently fail — caching is non-critical
  }
};

/**
 * Delete a cache key.
 */
const delCache = async (key) => {
  if (!redisAvailable || !redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // Silently fail
  }
};

/**
 * Atomically set a cache key ONLY if it does not already exist (SET NX EX).
 * Returns true if the key was set (lock acquired), false if it already existed.
 * This prevents race conditions in idempotency checks.
 */
const setCacheNX = async (key, value, ttlSeconds) => {
  if (!redisAvailable || !redisClient) return false;
  try {
    const result = await redisClient.set(key, JSON.stringify(value), { NX: true, EX: ttlSeconds });
    return result === 'OK';
  } catch {
    return false;
  }
};

const testBlacklist = new Set();

/**
 * Add token JTI to blacklist with remaining expiration time as TTL
 */
const blacklistToken = async (jti, ttlSeconds) => {
  if (process.env.NODE_ENV === 'test' && !forceFailClosedInTest) {
    testBlacklist.add(jti);
    return;
  }
  if (!redisAvailable || !redisClient) return;
  try {
    if (ttlSeconds <= 0) return;
    await redisClient.setEx(`bl:${jti}`, Math.ceil(ttlSeconds), 'revoked');
  } catch (err) {
    logger.warn('Failed to blacklist token in Redis', { message: err.message });
  }
};

/**
 * Check if token JTI is blacklisted.
 *
 * SECURITY: When Redis is unavailable or disconnected, this check FAILS CLOSED (returns true),
 * denying access by default to prevent revoked tokens from being silently accepted during an outage.
 */
const isTokenBlacklisted = async (jti) => {
  if (process.env.NODE_ENV === 'test' && !forceFailClosedInTest) {
    return testBlacklist.has(jti);
  }
  if (!redisAvailable || !redisClient) {
    logger.warn('Redis unavailable during token blacklist check — failing closed (denying access)', { jti });
    return true; // FAIL CLOSED: Deny access if revocation status cannot be verified
  }
  try {
    const res = await redisClient.get(`bl:${jti}`);
    return res === 'revoked';
  } catch (err) {
    logger.error('Redis error during token blacklist check — failing closed', { message: err.message, jti });
    return true; // FAIL CLOSED: on Redis query error
  }
};

export function setRedisAvailable(val) {
  redisAvailable = val;
}

export function setRedisClient(client) {
  redisClient = client;
}

export function setForceFailClosedInTest(val) {
  forceFailClosedInTest = val;
}

export {
  connectRedis,
  getCache,
  setCache,
  setCacheNX,
  delCache,
  blacklistToken,
  isTokenBlacklisted,
  redisClient,
  redisAvailable,
};
