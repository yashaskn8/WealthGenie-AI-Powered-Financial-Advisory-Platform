import { PrometheusMetrics } from '../services/metricsCollector.js';
import { sendError } from './errorHandler.js';

function isHealthRequest(req) {
  return req.path === '/healthz'
    || req.path === '/readyz'
    || req.path === '/live'
    || req.path === '/ready'
    || req.path.startsWith('/health');
}

/**
 * Applies bounded in-flight admission control, exposes draining state to load
 * balancers, and records cardinality-safe HTTP metrics.
 */
export function createOperationalMiddleware({ runtimeState, maxInFlightRequests = 250 } = {}) {
  let inFlight = 0;

  return function operationalMiddleware(req, res, next) {
    const healthRequest = isHealthRequest(req);
    if (!healthRequest && runtimeState && !runtimeState.isReady()) {
      const draining = runtimeState.isDraining();
      res.setHeader('Connection', 'close');
      res.setHeader('Retry-After', '5');
      return sendError(
        req,
        res,
        503,
        draining
          ? 'Service is restarting. Please retry shortly.'
          : 'Service is not ready to accept traffic.',
        draining ? 'SERVICE_DRAINING' : 'SERVICE_NOT_READY',
      );
    }

    if (!healthRequest && inFlight >= maxInFlightRequests) {
      PrometheusMetrics.recordHttpOverload();
      res.setHeader('Retry-After', '1');
      return sendError(req, res, 503, 'Service is temporarily at capacity.', 'SERVICE_OVERLOADED');
    }

    const startedAt = process.hrtime.bigint();
    inFlight += 1;
    PrometheusMetrics.httpRequestStarted(inFlight);
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      inFlight = Math.max(0, inFlight - 1);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      PrometheusMetrics.httpRequestFinished(req.method, res.statusCode, durationMs, inFlight);
    };
    res.once('finish', complete);
    res.once('close', complete);
    return next();
  };
}
