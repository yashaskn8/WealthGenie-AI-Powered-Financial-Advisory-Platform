/**
 * Metrics Routes — GET /api/metrics
 * WG-018: Relocated from /api/chat/metrics to dedicated /api/metrics with verifyJWT.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { requireRole, verifyJWT } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

function tokensMatch(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyMetricsAccess(req, res, next) {
  const configuredToken = process.env.METRICS_TOKEN;
  if (configuredToken && tokensMatch(req.headers['x-metrics-token'], configuredToken)) return next();
  return verifyJWT(req, res, () => requireRole('admin')(req, res, next));
}

/**
 * GET /api/metrics [Protected]
 * Expose production Prometheus and JSON performance metrics for monitoring.
 * Requires valid JWT authentication.
 */
router.get('/', verifyMetricsAccess, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const { PrometheusMetrics } = await import('../services/metricsCollector.js');
  if (req.headers.accept && req.headers.accept.includes('json')) {
    return res.json(PrometheusMetrics.getSnapshotJSON());
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(PrometheusMetrics.getPrometheusFormat());
}));

export default router;
