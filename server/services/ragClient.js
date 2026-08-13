import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_API_KEY = process.env.ML_SERVICE_API_KEY || '';
const RAG_TIMEOUT_MS = 8000;

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
    const res = await axios.post(
      `${ML_SERVICE_URL}/rag/query`,
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
          ...(ML_API_KEY ? { 'X-API-Key': ML_API_KEY } : {}),
          ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
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
    const res = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: 3000,
      headers: {
        ...(ML_API_KEY ? { 'X-API-Key': ML_API_KEY } : {}),
        ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
      },
    });
    return res.data;
  } catch {
    return null;
  }
}
