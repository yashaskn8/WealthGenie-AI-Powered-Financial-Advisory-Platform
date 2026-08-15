import axios from 'axios';
import { trace } from '@opentelemetry/api';

const getMlServiceUrl = () => process.env.ML_SERVICE_URL || 'http://localhost:8000';
const getMlApiKey = () => process.env.ML_SERVICE_API_KEY || '';
const RAG_TIMEOUT_MS = 8000;

function getTracingHeaders(correlationId = null) {
  const headers = {};
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const sc = activeSpan.spanContext();
    headers['traceparent'] = `00-${sc.traceId}-${sc.spanId}-01`;
    if (!correlationId) correlationId = sc.traceId;
  }
  if (correlationId) {
    headers['X-Correlation-ID'] = correlationId;
    if (!headers['traceparent']) {
      const cleanHex = correlationId.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').slice(0, 32);
      headers['traceparent'] = `00-${cleanHex}-0000000000000001-01`;
    }
  }
  return headers;
}

let failureCount = 0;
let circuitOpenUntil = 0;

function isCircuitHealthy() {
  if (Date.now() < circuitOpenUntil) {
    return false;
  }
  return true;
}

function recordSuccess() {
  failureCount = 0;
  circuitOpenUntil = 0;
}

function recordFailure() {
  failureCount++;
  if (failureCount >= 3) {
    circuitOpenUntil = Date.now() + 60000;
    console.warn(`[RAGClient] Circuit breaker OPENED due to ${failureCount} consecutive failures.`);
  }
}


/**
 * Executes grounded RAG retrieval & answer synthesis against FastAPI /rag/query.
 * 
 * @param {Object} params - { query, top_k, threshold, tenant_id }
 * @param {string|null} correlationId - Optional correlation ID for tracing
 * @returns {Promise<Object|null>} Grounded RAG query response or null on failure
 */
export async function queryRAG({ query, top_k = 4, threshold = 0.0, tenant_id = 'default' }, correlationId = null) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return null;
  }

  if (!isCircuitHealthy()) {
    console.warn('[RAGClient] Circuit breaker OPEN — fast-failing query.');
    return null;
  }

  try {
    const mlUrl = getMlServiceUrl();
    const apiKey = getMlApiKey();
    const res = await axios.post(
      `${mlUrl}/rag/query`,
      {
        question: query.trim(),
        top_k: Number(top_k) || 4,
        threshold: Number(threshold) || 0.0,
        tenant_id,
      },
      {
        timeout: RAG_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
          ...getTracingHeaders(correlationId),
        },
      }
    );

    if (res.status === 200 && res.data) {
      recordSuccess();
      return res.data;
    }
    recordFailure();
    return null;
  } catch (err) {
    recordFailure();
    console.warn('[RAGClient] RAG service query failed:', err.response?.data?.detail || err.message);
    return null;
  }
}

/**
 * Health check endpoint for RAG subsystem.
 */
export async function checkRAGHealth(correlationId = null) {
  try {
    const mlUrl = getMlServiceUrl();
    const apiKey = getMlApiKey();
    const res = await axios.get(`${mlUrl}/health`, {
      timeout: 3000,
      headers: {
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        ...getTracingHeaders(correlationId),
      },
    });
    return res.data;
  } catch {
    return null;
  }
}
