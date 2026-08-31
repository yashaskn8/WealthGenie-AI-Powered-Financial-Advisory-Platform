import crypto from 'node:crypto';
import {
  readCsrfCookie,
  readSessionCookie,
} from '../services/authSession.js';
import { PrometheusMetrics } from '../services/metricsCollector.js';
import { sendError } from './errorHandler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Double-submit CSRF protection for browser cookie sessions. Explicit Bearer
 * requests remain suitable for non-browser API clients and are not subject to
 * cookie-based CSRF attacks.
 */
export function createCsrfProtection({ allowedOrigins = [], isProduction = false } = {}) {
  const allowlist = new Set(allowedOrigins);

  return function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.headers.authorization?.startsWith('Bearer ')) return next();
    if (!readSessionCookie(req)) return next();

    const cookieToken = readCsrfCookie(req);
    const headerToken = req.headers['x-csrf-token'];
    if (!safeEqual(cookieToken, headerToken)) {
      PrometheusMetrics.inc('csrf_rejections_total');
      return sendError(req, res, 403, 'Request could not be verified.', 'CSRF_TOKEN_INVALID');
    }

    if (isProduction) {
      const origin = req.headers.origin?.replace(/\/+$/, '');
      if (!origin || !allowlist.has(origin)) {
        PrometheusMetrics.inc('csrf_rejections_total');
        return sendError(req, res, 403, 'Request origin could not be verified.', 'CSRF_ORIGIN_INVALID');
      }
    }

    return next();
  };
}
