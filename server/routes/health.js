import { Router } from 'express';
import mongoose from 'mongoose';
import { redisClient, redisAvailable } from '../config/redis.js';
import { checkMLHealth } from '../services/mlClient.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /health/deep
 * Performs a deep health check of Database, Redis, and ML microservice.
 *
 * Semantics:
 *   - Database is the ONLY critical dependency.  If it is DOWN the endpoint
 *     returns 503.
 *   - Redis and ML are non-critical.  The application gracefully degrades
 *     without them (cache-less mode, rule-based fallback).  If they are
 *     unavailable the overall status is DEGRADED but the HTTP status is still
 *     200, which prevents false-negative failures in CD smoke tests during
 *     cluster warm-up.
 */
router.get('/deep', asyncHandler(async (req, res) => {
  // Internal tracking with criticality flag
  const checks = {
    database: { status: 'DOWN', critical: true },
    redis:    { status: 'DOWN', critical: false },
    ml:       { status: 'DOWN', critical: false },
  };

  // 1. Check MongoDB (critical)
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
      await Promise.race([
        mongoose.connection.db.admin().ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Mongo ping timeout')), 3000)),
      ]);
      checks.database.status = 'UP';
    }
  } catch (err) {
    console.error('[Health Check] Database health check failed:', err.message);
  }

  // 2. Check Redis (non-critical)
  try {
    if (redisAvailable && redisClient) {
      const pingRes = await Promise.race([
        redisClient.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 3000)),
      ]);
      if (pingRes === 'PONG') {
        checks.redis.status = 'UP';
      }
    }
  } catch (err) {
    console.error('[Health Check] Redis health check failed:', err.message);
  }

  // 3. Check ML Microservice (non-critical)
  //    Any successful HTTP response means the service is running.
  //    Possible status values from ML: "ok", "model_not_loaded", "healthy",
  //    "ready", "UP".  All indicate the process is alive.
  try {
    const mlHealth = await checkMLHealth(req.correlationId);
    if (mlHealth) {
      // ML service responded over HTTP — it is reachable and alive
      checks.ml.status = 'UP';
    }
  } catch (err) {
    console.error('[Health Check] ML service health check failed:', err.message);
  }

  // Determine overall status
  const criticalDown = Object.values(checks)
    .some(svc => svc.critical && svc.status === 'DOWN');

  const allUp = Object.values(checks).every(svc => svc.status === 'UP');

  // Build backward-compatible response (flat strings for services)
  const health = {
    status: criticalDown ? 'DOWN' : (allUp ? 'UP' : 'DEGRADED'),
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId || null,
    services: {
      database: checks.database.status,
      redis: checks.redis.status,
      ml: checks.ml.status,
    }
  };

  // Only database DOWN triggers a 503; non-critical degradation is still 200
  res.status(criticalDown ? 503 : 200).json(health);
}));

/**
 * GET /health
 * Simple liveness probe for load balancer.
 */
router.get('/', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

/**
 * GET /health/ready
 * Readiness probe - returns 200 only when the database is connected and responsive.
 * Container orchestrators use this to decide when to route traffic.
 */
router.get('/ready', (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ status: 'NOT_READY', reason: 'Database not connected' });
  }
  res.status(200).json({ status: 'READY', timestamp: new Date().toISOString() });
});

/**
 * GET /health/live
 * Liveness probe - returns 200 if the process is alive.
 * Container orchestrators use this to decide whether to restart the container.
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'ALIVE',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
