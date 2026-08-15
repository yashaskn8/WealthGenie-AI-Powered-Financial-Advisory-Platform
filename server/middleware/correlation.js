import crypto from 'crypto';
import { trace } from '@opentelemetry/api';

/**
 * Middleware to generate or forward X-Correlation-ID and W3C traceparent.
 * Guarantees that every request has a trace token available on req.correlationId
 * and traceparent for cross-service distributed tracing.
 */
export const correlationIdMiddleware = (req, res, next) => {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();

  const cid = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();
  const traceId = spanContext?.traceId || req.headers['traceparent']?.split('-')[1] || cid.replace(/-/g, '').padEnd(32, '0').slice(0, 32);
  const spanId = spanContext?.spanId || crypto.randomBytes(8).toString('hex');
  const traceparent = req.headers['traceparent'] || `00-${traceId}-${spanId}-01`;

  req.correlationId = cid;
  req.traceId = traceId;
  req.spanId = spanId;
  req.traceparent = traceparent;

  // Forward in request headers for routing/downstream clients
  req.headers['x-correlation-id'] = cid;
  req.headers['traceparent'] = traceparent;

  // Return in response headers
  res.setHeader('X-Correlation-ID', cid);
  res.setHeader('traceparent', traceparent);
  next();
};

