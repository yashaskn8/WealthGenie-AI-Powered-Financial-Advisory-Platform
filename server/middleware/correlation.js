import crypto from 'crypto';
import { trace } from '@opentelemetry/api';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const VALID_TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i;

function safeCorrelationId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return SAFE_CORRELATION_ID.test(trimmed) ? trimmed : null;
}

function safeTraceparent(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return VALID_TRACEPARENT.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Middleware to generate or forward X-Correlation-ID and W3C traceparent.
 * Guarantees that every request has a trace token available on req.correlationId
 * and traceparent for cross-service distributed tracing.
 */
export const correlationIdMiddleware = (req, res, next) => {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();

  const cid = safeCorrelationId(req.headers['x-correlation-id'])
    || safeCorrelationId(req.headers['x-request-id'])
    || crypto.randomUUID();
  const incomingTraceparent = safeTraceparent(req.headers.traceparent);
  const traceId = spanContext?.traceId
    || incomingTraceparent?.split('-')[1]
    || crypto.createHash('sha256').update(cid).digest('hex').slice(0, 32);
  const spanId = spanContext?.spanId || crypto.randomBytes(8).toString('hex');
  const traceparent = incomingTraceparent || `00-${traceId}-${spanId}-01`;

  req.correlationId = cid;
  req.traceId = traceId;
  req.spanId = spanId;
  req.traceparent = traceparent;

  // Forward in request headers for routing/downstream clients
  req.headers['x-correlation-id'] = cid;
  req.headers['traceparent'] = traceparent;

  // Return in response headers
  res.setHeader('X-Correlation-ID', cid);
  res.setHeader('X-Request-ID', cid);
  res.setHeader('traceparent', traceparent);
  next();
};

