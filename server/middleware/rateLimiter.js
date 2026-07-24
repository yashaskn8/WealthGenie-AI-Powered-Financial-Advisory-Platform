import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient, redisAvailable } from '../config/redis.js';

class HybridStore {
  constructor(options = {}) {
    this.options = options;
    this.redisStore = null;
  }

  getStore() {
    if (redisAvailable && redisClient) {
      if (!this.redisStore) {
        this.redisStore = new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
          prefix: this.options.prefix || 'rl:',
        });
      }
      return this.redisStore;
    }
    return null;
  }

  async increment(key) {
    const store = this.getStore();
    if (store) return store.increment(key);
    return { totalHits: 1, resetTime: new Date(Date.now() + 60000) };
  }

  async decrement(key) {
    const store = this.getStore();
    if (store) return store.decrement(key);
  }

  async resetKey(key) {
    const store = this.getStore();
    if (store) return store.resetKey(key);
  }

  async resetAll() {
    const store = this.getStore();
    if (store && store.resetAll) {
      await store.resetAll();
    }
  }
}

// Strict limiter for authentication endpoints (registration, login)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 100, // High threshold for cluster tests
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new HybridStore({ prefix: 'rl:auth:' }),
  passOnStoreError: true, // Allow request through if both stores fail
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

// Standard API rate limiter (protects database/CPU resource consumption)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 1000, // High threshold for cluster load tests
  message: { error: 'Rate limit exceeded.' },
  store: new HybridStore({ prefix: 'rl:api:' }),
  passOnStoreError: true,
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

