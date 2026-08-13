/**
 * Token Budget Middleware
 * ----------------------
 * Enforces a per-user rolling token budget on chat endpoints.
 * Unlike the request-count rate limiter, this tracks *cumulative token usage*
 * over a rolling window, preventing cost/abuse spikes from long prompts.
 *
 * Storage: in-memory Map (upgradeable to Redis via the same HybridStore
 * pattern used in rateLimiter.js).
 */

// Default budget: 50 000 tokens per 60-second window
const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_TOKENS = 50_000;

class TokenBudgetStore {
  constructor() {
    /** @type {Map<string, { tokens: number, resetTime: number }>} */
    this.buckets = new Map();
  }

  /**
   * Record token usage for a key. Returns the updated bucket state.
   * @param {string} key   - usually the userId
   * @param {number} tokens - tokens consumed by this request
   * @param {number} windowMs
   * @returns {{ totalTokens: number, resetTime: number }}
   */
  record(key, tokens, windowMs) {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetTime) {
      bucket = { tokens: 0, resetTime: now + windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.tokens += tokens;
    return { totalTokens: bucket.tokens, resetTime: bucket.resetTime };
  }

  /**
   * Peek at current usage without recording anything.
   */
  peek(key) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetTime) return { totalTokens: 0 };
    return { totalTokens: bucket.tokens, resetTime: bucket.resetTime };
  }

  reset(key) {
    this.buckets.delete(key);
  }

  resetAll() {
    this.buckets.clear();
  }
}

// Singleton store
const store = new TokenBudgetStore();

/**
 * Factory: creates Express middleware that enforces a rolling token budget.
 *
 * Usage:
 *   import { checkTokenBudget, recordTokenUsage } from './tokenBudget.js';
 *   router.post('/message', verifyJWT, checkTokenBudget(), handler);
 *   // Inside handler, after getting the AI response:
 *   recordTokenUsage(req, totalTokensUsed);
 */
export function checkTokenBudget(options = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    maxTokens = DEFAULT_MAX_TOKENS,
    keyGenerator = (req) => req.user?.userId || req.ip,
  } = options;

  return (req, _res, next) => {
    const key = keyGenerator(req);
    const { totalTokens } = store.peek(key);

    if (totalTokens >= maxTokens) {
      const bucket = store.buckets.get(key);
      const retryAfterMs = bucket ? bucket.resetTime - Date.now() : windowMs;
      const retryAfterSec = Math.ceil(Math.max(retryAfterMs, 1000) / 1000);

      return _res.status(429).json({
        error: 'Token budget exceeded',
        message: `You have used ${totalTokens} tokens in the current window (limit: ${maxTokens}). Try again in ${retryAfterSec}s.`,
        retryAfterSeconds: retryAfterSec,
      });
    }

    // Attach helper so downstream handler can record usage
    req.tokenBudgetKey = key;
    req.tokenBudgetWindowMs = windowMs;
    next();
  };
}

/**
 * Record token usage after a successful AI response.
 * Call this inside the route handler once you know the token count.
 */
export function recordTokenUsage(req, tokens) {
  if (!req.tokenBudgetKey) return;
  store.record(req.tokenBudgetKey, tokens, req.tokenBudgetWindowMs || DEFAULT_WINDOW_MS);
}

// Expose for testing
export { store as _testStore, TokenBudgetStore };
