import { Router } from 'express';
import mongoose from 'mongoose';
import { redisClient, redisAvailable } from '../config/redis.js';
import { checkMLHealth } from '../services/mlClient.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /health/deep
 * Performs a deep health check of Database, Redis, and ML microservice.
 * Returns 200 OK if all UP, or 503 Service Unavailable if any dependency is DOWN.
 */
router.get('/deep', asyncHandler(async (req, res) => {
  const health = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId || null,
    services: {
      database: 'DOWN',
      redis: 'DOWN',
      ml: 'DOWN',
    }
  };

  // 1. Check MongoDB
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
      // Run quick admin ping to confirm actual network/liveness
      await mongoose.connection.db.admin().ping();
      health.services.database = 'UP';
    }
  } catch (err) {
    console.error('[Health Check] Database health check failed:', err.message);
  }

  // 2. Check Redis
  try {
    if (redisAvailable && redisClient) {
      const pingRes = await redisClient.ping();
      if (pingRes === 'PONG') {
        health.services.redis = 'UP';
      }
    }
  } catch (err) {
    console.error('[Health Check] Redis health check failed:', err.message);
  }

  // 3. Check ML Microservice
  try {
    const mlHealth = await checkMLHealth(req.correlationId);
    if (mlHealth && (mlHealth.status === 'UP' || mlHealth.status === 'healthy' || mlHealth.healthy === true)) {
      health.services.ml = 'UP';
    }
  } catch (err) {
    console.error('[Health Check] ML service health check failed:', err.message);
  }

  // Determine overall status
  const allServicesUp = Object.values(health.services).every(status => status === 'UP');
  if (allServicesUp) {
    res.status(200).json(health);
  } else {
    health.status = 'DOWN';
    res.status(503).json(health);
  }
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
 * Readiness probe — returns 200 only when the database is connected and responsive.
 * Container orchestrators use this to decide when to route traffic.
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: 'NOT_READY', reason: 'Database not connected' });
    }
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ status: 'READY', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'NOT_READY', reason: err.message });
  }
}));

/**
 * GET /health/live
 * Liveness probe — returns 200 if the process is alive.
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
