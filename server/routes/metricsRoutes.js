/**
 * Metrics Routes — GET /api/metrics
 * WG-018: Relocated from /api/chat/metrics to dedicated /api/metrics with verifyJWT.
 */
import { Router } from 'express';
import { verifyJWT } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/metrics [Protected]
 * Expose production Prometheus and JSON performance metrics for monitoring.
 * Requires valid JWT authentication.
 */
router.get('/', verifyJWT, asyncHandler(async (req, res) => {
  const { PrometheusMetrics } = await import('../services/metricsCollector.js');
  if (req.headers.accept && req.headers.accept.includes('json')) {
    return res.json(PrometheusMetrics.getSnapshotJSON());
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(PrometheusMetrics.getPrometheusFormat());
}));

export default router;
