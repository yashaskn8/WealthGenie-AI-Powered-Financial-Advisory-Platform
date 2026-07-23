import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import crypto from 'crypto';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import logger, { morganStream } from './utils/logger.js';
import { connectRedis, redisClient } from './config/redis.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import recommendRoutes from './routes/recommend.js';
import instrumentRoutes from './routes/instruments.js';
import projectionRoutes from './routes/projection.js';
import montecarloRoutes from './routes/montecarlo.js';
import goalRoutes from './routes/goals.js';
import marketRoutes from './routes/market.js';
import taxRoutes from './routes/tax.js';
import chatRoutes from './routes/chatRoutes.js';
import portfolioRoutes from './routes/portfolio.js';
import { enforceJsonContentType } from './middleware/contentType.js';
import { correlationIdMiddleware } from './middleware/correlation.js';
import healthRoutes from './routes/health.js';
import { startMarketDataRefreshJobs } from './jobs/marketDataRefresh.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers (Helmet) ────────────────────────────────────
// BEGINNER NOTE: Helmet is a collection of middleware functions that set HTTP headers.
// These headers protect the app from well-known web vulnerabilities (e.g. Clickjacking,
// cross-site scripting/XSS attacks, and sniffing) by telling the browser how to behave.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://generativelanguage.googleapis.com", "https://api.groq.com"],
    }
  } : false, // Vite dev server injects inline scripts in development
}));

// ── CORS (Cross-Origin Resource Sharing) ─────────────────────────
// BEGINNER NOTE: By default, browsers prevent scripts on one website (e.g., http://localhost:5173)
// from making requests to an API hosted on another domain/port (e.g., http://localhost:5000).
// CORS middleware allows the server to explicitly list which frontend domains (origins)
// are allowed to send requests and read responses.
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];
const ALLOWED_ORIGINS = configuredOrigins.length > 0
  ? configuredOrigins
  : DEFAULT_ALLOWED_ORIGINS;
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

// ── Correlation ID Middleware ────────────────────────────────────
// Assigns a unique X-Correlation-ID tracing token to every request
app.use(correlationIdMiddleware);

// ── Content-Type Enforcement & Body Parsing ──────────────────────
// Strictly validate that POST, PUT, and PATCH requests use application/json
app.use(enforceJsonContentType);

// Parse incoming request bodies with JSON payloads, limiting payload to 100kb
// to prevent Denial of Service (DoS) attacks from sending huge payloads.
app.use(express.json({ limit: '100kb' }));

// ── NoSQL Injection Prevention ───────────────────────────────────
app.use(mongoSanitize());

// ── Request Logging ──────────────────────────────────────────────
// Morgan pipes HTTP request logs through Winston for structured output.
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('short', { stream: morganStream }));
}

// ── Performance Monitoring Middleware ────────────────────────────
app.use((req, res, next) => {
  req._startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req._startTime;
    if (duration > 3000) {
      logger.warn('Slow request detected', { correlationId: req.correlationId, method: req.method, path: req.originalUrl, durationMs: duration });
    }
  });
  next();
});

// ── Rate Limiting (Redis-backed with dynamic memory fallback) ────
import { authLimiter, apiLimiter } from './middleware/rateLimiter.js';

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ── Health Routes ────────────────────────────────────────────────
app.use('/health', healthRoutes);

// ── Root-level health aliases for Railway / container probes ─────
app.get('/ready', (req, res) => res.redirect(307, '/health/ready'));
app.get('/live', (req, res) => res.redirect(307, '/health/live'));

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/recommend', recommendRoutes);
app.use('/api/instruments', instrumentRoutes);
app.use('/api/projection', projectionRoutes);
app.use('/api/montecarlo', montecarloRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/portfolio', portfolioRoutes);

// ── Health Check (Detailed) ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'WealthGenie API v3.0',
    uptime_seconds: Math.round(process.uptime()),
    node_version: process.version,
    memory: {
      rss_mb: Math.round(memUsage.rss / 1048576),
      heap_used_mb: Math.round(memUsage.heapUsed / 1048576),
      heap_total_mb: Math.round(memUsage.heapTotal / 1048576),
    },
    engines: {
      tax: 'FY2025-26 (Section 87A marginal relief + surcharge marginal relief)',
      monte_carlo: 'Halton QMC + Antithetic Variates + Control Variates',
      risk_profiler: '3-Factor Model (Age + Income + Horizon)',
      projections: 'Real + Nominal (Fisher Equation inflation adjustment)',
      post_tax: 'FY2025-26 LTCG/STCG/EEE compliance',
    },
    features: [
      'SHAP', 'MonteCarlo-QMC', 'GoalPlanner', 'LiveMarketData',
      'TaxCompare', 'PostTaxCalc', 'RateLimiting', 'GenieChat',
      'SharpeRatio', 'PortfolioAllocation', 'VarianceReduction',
    ],
  });
});

// ── 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ── Error Handler (must be last) ─────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────
let server;

const start = async () => {
  // ── Critical Environment Validation ─────────────────────────────
  const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI'];
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.error('Missing required environment variables — server cannot start', { missing });
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    logger.warn('JWT_SECRET is shorter than 32 characters. Use a strong secret in production.');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.ML_SERVICE_API_KEY) {
    logger.error('ML_SERVICE_API_KEY is required in production. Set this variable to secure inter-service communication.');
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    logger.warn('Neither GEMINI_API_KEY nor GROQ_API_KEY configured. AI features will be unavailable.');
  }

  await connectDB();
  await connectRedis();

  // Start market data cron jobs (non-blocking)
  startMarketDataRefreshJobs();

  server = app.listen(PORT, () => logger.info('WealthGenie API v3.0 started', { port: PORT, env: process.env.NODE_ENV || 'development' }));
};

// ── Graceful Shutdown ────────────────────────────────────────────
async function gracefulShutdown(signal) {
  logger.info('Graceful shutdown initiated', { signal });

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error('Error closing MongoDB connection', { message: err.message });
      }
      if (redisClient) {
        try {
          await redisClient.quit();
          logger.info('Redis connection closed');
        } catch (err) {
          logger.error('Error closing Redis connection', { message: err.message });
        }
      }
      process.exit(0);
    });

    // Force exit after 10 seconds if connections haven't closed
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start().catch(err => { logger.error('Failed to start server', { message: err.message, stack: err.stack }); process.exit(1); });
