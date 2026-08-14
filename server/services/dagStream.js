import crypto from 'crypto';
import { redisClient, redisAvailable } from '../config/redis.js';
import logger from '../utils/logger.js';

// In-memory fallback for local dev / tests when Redis is not active
const inMemoryStreams = new Map();
const inMemoryWorkflowIndex = new Set();
const inMemoryDeadLetters = [];

export function computeHash(data) {
  if (data === null || data === undefined) return '';
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Appends an execution step to the workflow's Redis Stream.
 */
export async function appendStep(workflowId, stepData, client = redisClient) {
  const timestamp = new Date().toISOString();
  const inputHash = computeHash(stepData.input);
  const outputHash = computeHash(stepData.result);

  const entry = {
    workflow_id: workflowId,
    step_name: stepData.stepName || `step_${stepData.stepIndex}`,
    step_index: String(stepData.stepIndex ?? 0),
    status: stepData.status || 'completed',
    input_hash: inputHash,
    output_hash: outputHash,
    input_json: JSON.stringify(stepData.input || {}),
    result_json: JSON.stringify(stepData.result || null),
    error: stepData.error || '',
    timestamp,
  };

  const streamKey = `stream:dag:${workflowId}`;

  if (redisAvailable && client && typeof client.xAdd === 'function') {
    try {
      const entryId = await client.xAdd(streamKey, '*', entry);
      await client.sAdd('stream:dag:index', workflowId);
      return entryId;
    } catch (err) {
      logger.warn('Failed to append step to Redis Stream, falling back to in-memory store', { error: err.message });
    }
  }

  if (!inMemoryStreams.has(streamKey)) {
    inMemoryStreams.set(streamKey, []);
  }
  const memEntryId = `${Date.now()}-${inMemoryStreams.get(streamKey).length}`;
  inMemoryStreams.get(streamKey).push({ id: memEntryId, message: entry });
  inMemoryWorkflowIndex.add(workflowId);
  return memEntryId;
}

/**
 * Checks if a step has already been completed with identical inputs (Idempotency).
 *
 * @param {string} workflowId
 * @param {string} stepName
 * @param {object} input
 * @returns {Promise<{ isIdempotent: boolean, cachedResult: any }>}
 */
export async function checkIdempotency(workflowId, stepName, input) {
  const steps = await getWorkflowSteps(workflowId);
  const targetHash = computeHash(input);

  const existing = steps.find(
    s => s.stepName === stepName && s.status === 'completed' && s.inputHash === targetHash
  );

  if (existing) {
    logger.info(`Idempotent hit: step ${stepName} for workflow ${workflowId} already completed with identical inputs. Returning cached result.`);
    return { isIdempotent: true, cachedResult: existing.result };
  }

  return { isIdempotent: false, cachedResult: null };
}

/**
 * Routes a persistently failing step to the Dead-Letter Queue (DLQ).
 *
 * @param {string} workflowId
 * @param {object} dlqData - { stepName, stepIndex, input, error, retryCount }
 * @param {object} [client]
 * @returns {Promise<string>} Dead-letter entry ID
 */
export async function routeToDeadLetter(workflowId, dlqData, client = redisClient) {
  const timestamp = new Date().toISOString();
  const inputHash = computeHash(dlqData.input);

  const dlqEntry = {
    workflow_id: workflowId,
    step_name: dlqData.stepName,
    step_index: String(dlqData.stepIndex ?? 0),
    input_hash: inputHash,
    input_json: JSON.stringify(dlqData.input || {}),
    error: dlqData.error || 'Max retries exhausted',
    retry_count: String(dlqData.retryCount || 3),
    timestamp,
  };

  const dlqKey = 'stream:dag:dead_letter';

  if (redisAvailable && client && typeof client.xAdd === 'function') {
    try {
      const entryId = await client.xAdd(dlqKey, '*', dlqEntry);
      logger.error(`Routed failed workflow step to Dead-Letter Queue`, { workflowId, stepName: dlqData.stepName, retryCount: dlqData.retryCount });
      return entryId;
    } catch (err) {
      logger.warn('Failed to push to Redis Dead-Letter Stream, falling back to in-memory', { error: err.message });
    }
  }

  const memId = `dlq-${Date.now()}-${inMemoryDeadLetters.length}`;
  inMemoryDeadLetters.push({ id: memId, message: dlqEntry });
  logger.error(`Routed failed step to in-memory Dead-Letter Queue`, { workflowId, stepName: dlqData.stepName });
  return memId;
}

/**
 * Retrieves all items in the Dead-Letter Queue.
 */
export async function getDeadLetters(client = redisClient) {
  const dlqKey = 'stream:dag:dead_letter';
  let rawEntries = [];

  if (redisAvailable && client && typeof client.xRange === 'function') {
    try {
      rawEntries = await client.xRange(dlqKey, '-', '+');
    } catch {
      rawEntries = inMemoryDeadLetters;
    }
  } else {
    rawEntries = inMemoryDeadLetters;
  }

  return rawEntries.map(e => {
    const msg = e.message || {};
    let parsedInput = {};
    try { parsedInput = JSON.parse(msg.input_json || '{}'); } catch { /* ignore */ }

    return {
      deadLetterId: e.id,
      workflowId: msg.workflow_id,
      stepName: msg.step_name,
      stepIndex: parseInt(msg.step_index || '0', 10),
      inputHash: msg.input_hash,
      input: parsedInput,
      error: msg.error,
      retryCount: parseInt(msg.retry_count || '0', 10),
      timestamp: msg.timestamp,
    };
  });
}

/**
 * Retrieves all chronological steps recorded for a workflow DAG.
 */
export async function getWorkflowSteps(workflowId, client = redisClient) {
  const streamKey = `stream:dag:${workflowId}`;

  let rawEntries = [];
  if (redisAvailable && client && typeof client.xRange === 'function') {
    try {
      rawEntries = await client.xRange(streamKey, '-', '+');
    } catch (err) {
      rawEntries = inMemoryStreams.get(streamKey) || [];
    }
  } else {
    rawEntries = inMemoryStreams.get(streamKey) || [];
  }

  return rawEntries.map(e => {
    const msg = e.message || {};
    let parsedInput = {};
    let parsedResult = null;
    try { parsedInput = JSON.parse(msg.input_json || '{}'); } catch { /* ignore */ }
    try { parsedResult = JSON.parse(msg.result_json || 'null'); } catch { /* ignore */ }

    return {
      streamEntryId: e.id,
      workflowId: msg.workflow_id,
      stepName: msg.step_name,
      stepIndex: parseInt(msg.step_index || '0', 10),
      status: msg.status,
      inputHash: msg.input_hash,
      outputHash: msg.output_hash,
      input: parsedInput,
      result: parsedResult,
      error: msg.error,
      timestamp: msg.timestamp,
    };
  }).sort((a, b) => a.stepIndex - b.stepIndex);
}

/**
 * Executes an individual step with Idempotency check and automatic retry / dead-letter handling.
 *
 * @param {string} workflowId
 * @param {object} step - { name, execute }
 * @param {number} stepIndex
 * @param {object} context
 * @param {number} [maxRetries=3]
 * @returns {Promise<any>}
 */
export async function executeStepIdempotent(workflowId, step, stepIndex, context, maxRetries = 3) {
  const stepName = step.name || `step_${stepIndex}`;

  // 1. Idempotency Check: return cached result if already completed with identical inputs
  const { isIdempotent, cachedResult } = await checkIdempotency(workflowId, stepName, context);
  if (isIdempotent) {
    return { result: cachedResult, fromCache: true };
  }

  // 2. Execute with Retry Loop
  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    attempts++;
    await appendStep(workflowId, {
      stepName,
      stepIndex,
      status: 'running',
      input: context,
    });

    try {
      const result = await step.execute(context);
      await appendStep(workflowId, {
        stepName,
        stepIndex,
        status: 'completed',
        input: context,
        result,
      });
      return { result, fromCache: false };
    } catch (err) {
      lastError = err;
      logger.warn(`Step ${stepName} failed on attempt ${attempts}/${maxRetries}`, { error: err.message });
    }
  }

  // 3. Max retries exhausted: Route to Dead-Letter Queue
  await appendStep(workflowId, {
    stepName,
    stepIndex,
    status: 'failed',
    input: context,
    error: lastError?.message || 'Execution failed',
  });

  await routeToDeadLetter(workflowId, {
    stepName,
    stepIndex,
    input: context,
    error: lastError?.message || 'Max retries exhausted',
    retryCount: attempts,
  });

  throw lastError;
}

/**
 * Executes a multi-step workflow with step persistence and idempotency.
 */
export async function executeWorkflow(workflowId, steps = [], initialContext = {}) {
  const context = { ...initialContext };
  const executedSteps = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `step_${i}`;

    const { result, fromCache } = await executeStepIdempotent(workflowId, step, i, context);
    if (result && typeof result === 'object') {
      Object.assign(context, result);
    }
    executedSteps.push({ stepName, stepIndex: i, status: 'completed', result, fromCache });
  }

  return {
    workflowId,
    status: 'COMPLETED',
    steps: executedSteps,
    context,
  };
}

/**
 * Resumes an interrupted workflow with idempotency checks on each step.
 */
export async function resumeWorkflow(workflowId, steps = [], fallbackContext = {}) {
  const recordedSteps = await getWorkflowSteps(workflowId);
  const completedSteps = recordedSteps.filter(s => s.status === 'completed');
  let lastCompletedIndex = -1;
  const context = { ...fallbackContext };

  for (const step of completedSteps) {
    if (step.stepIndex > lastCompletedIndex) {
      lastCompletedIndex = step.stepIndex;
    }
    if (step.result && typeof step.result === 'object') {
      Object.assign(context, step.result);
    }
  }

  const startIndex = lastCompletedIndex + 1;
  const stepsExecuted = [];

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `step_${i}`;

    const { result, fromCache } = await executeStepIdempotent(workflowId, step, i, context);
    if (result && typeof result === 'object') {
      Object.assign(context, result);
    }
    stepsExecuted.push({ stepName, stepIndex: i, status: 'completed', result, fromCache });
  }

  return {
    workflowId,
    status: 'COMPLETED',
    resumedFromStepIndex: startIndex,
    skippedStepsCount: startIndex,
    stepsExecuted,
    context,
  };
}

export function clearInMemoryStreams() {
  inMemoryStreams.clear();
  inMemoryWorkflowIndex.clear();
  inMemoryDeadLetters.length = 0;
}
