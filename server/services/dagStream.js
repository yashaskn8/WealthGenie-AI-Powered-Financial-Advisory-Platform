import crypto from 'crypto';
import { redisClient, redisAvailable } from '../config/redis.js';
import logger from '../utils/logger.js';

// In-memory fallback for local dev / tests when Redis is not active
const inMemoryStreams = new Map();
const inMemoryWorkflowIndex = new Set();

export function computeHash(data) {
  if (data === null || data === undefined) return '';
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Appends an execution step to the workflow's Redis Stream.
 *
 * @param {string} workflowId - Unique workflow / DAG run identifier
 * @param {object} stepData - { stepName, stepIndex, status, input, result, error }
 * @param {object} [client] - Optional custom Redis client
 * @returns {Promise<string>} Stream entry ID
 */
export async function appendStep(workflowId, stepData, client = redisClient) {
  const timestamp = new Date().toISOString();
  const inputHash = computeHash(stepData.input);
  const outputHash = computeHash(stepData.result);

  const entry = {
    workflow_id: workflowId,
    step_name: stepData.stepName || `step_${stepData.stepIndex}`,
    step_index: String(stepData.stepIndex ?? 0),
    status: stepData.status || 'completed', // 'running' | 'completed' | 'failed'
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
      logger.info(`Persisted DAG step to Redis Stream`, { workflowId, stepIndex: stepData.stepIndex, status: stepData.status });
      return entryId;
    } catch (err) {
      logger.warn('Failed to append step to Redis Stream, falling back to in-memory store', { error: err.message });
    }
  }

  // Fallback to in-memory store
  if (!inMemoryStreams.has(streamKey)) {
    inMemoryStreams.set(streamKey, []);
  }
  const memEntryId = `${Date.now()}-${inMemoryStreams.get(streamKey).length}`;
  inMemoryStreams.get(streamKey).push({ id: memEntryId, message: entry });
  inMemoryWorkflowIndex.add(workflowId);
  return memEntryId;
}

/**
 * Retrieves all chronological steps recorded for a workflow DAG from Redis Streams.
 *
 * @param {string} workflowId
 * @param {object} [client]
 * @returns {Promise<Array<object>>} Ordered steps list
 */
export async function getWorkflowSteps(workflowId, client = redisClient) {
  const streamKey = `stream:dag:${workflowId}`;

  let rawEntries = [];
  if (redisAvailable && client && typeof client.xRange === 'function') {
    try {
      rawEntries = await client.xRange(streamKey, '-', '+');
    } catch (err) {
      logger.warn('Failed to read from Redis Stream, falling back to in-memory', { error: err.message });
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
 * Returns all recorded workflow IDs.
 */
export async function listRecordedWorkflows(client = redisClient) {
  if (redisAvailable && client && typeof client.sMembers === 'function') {
    try {
      return await client.sMembers('stream:dag:index');
    } catch {
      return Array.from(inMemoryWorkflowIndex);
    }
  }
  return Array.from(inMemoryWorkflowIndex);
}

/**
 * Executes a multi-step workflow with full Redis Streams step persistence.
 *
 * @param {string} workflowId - Unique workflow ID
 * @param {Array<{ name: string, execute: Function }>} steps - Sequence of step execution functions
 * @param {object} initialContext - Context passed to and mutated across steps
 * @returns {Promise<{ workflowId: string, status: string, steps: Array<object>, context: object }>}
 */
export async function executeWorkflow(workflowId, steps = [], initialContext = {}) {
  const context = { ...initialContext };
  const executedSteps = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `step_${i}`;

    // 1. Log step starting
    await appendStep(workflowId, {
      stepName,
      stepIndex: i,
      status: 'running',
      input: context,
    });

    try {
      // 2. Execute step action
      const result = await step.execute(context);
      if (result && typeof result === 'object') {
        Object.assign(context, result);
      }

      // 3. Log step completed
      await appendStep(workflowId, {
        stepName,
        stepIndex: i,
        status: 'completed',
        input: context,
        result,
      });

      executedSteps.push({ stepName, stepIndex: i, status: 'completed', result });
    } catch (err) {
      // Log step failure
      await appendStep(workflowId, {
        stepName,
        stepIndex: i,
        status: 'failed',
        input: context,
        error: err.message,
      });
      throw err;
    }
  }

  return {
    workflowId,
    status: 'COMPLETED',
    steps: executedSteps,
    context,
  };
}

/**
 * Resumes an interrupted or crashed workflow from the last successfully completed step.
 * Reads the Redis Stream, identifies already-completed steps, and executes only the
 * remaining uncompleted steps.
 *
 * @param {string} workflowId - Workflow ID to resume
 * @param {Array<{ name: string, execute: Function }>} steps - Full workflow steps definition
 * @param {object} fallbackContext - Initial context if none recovered
 * @returns {Promise<{ workflowId: string, status: string, resumedFromStepIndex: number, stepsExecuted: Array<object>, context: object }>}
 */
export async function resumeWorkflow(workflowId, steps = [], fallbackContext = {}) {
  const recordedSteps = await getWorkflowSteps(workflowId);

  // Find the highest step index that was 'completed'
  const completedSteps = recordedSteps.filter(s => s.status === 'completed');
  let lastCompletedIndex = -1;
  const context = { ...fallbackContext };

  for (const step of completedSteps) {
    if (step.stepIndex > lastCompletedIndex) {
      lastCompletedIndex = step.stepIndex;
    }
    // Replay/accumulate context from completed step results
    if (step.result && typeof step.result === 'object') {
      Object.assign(context, step.result);
    }
  }

  const startIndex = lastCompletedIndex + 1;
  const stepsExecuted = [];

  logger.info(`Resuming workflow ${workflowId}`, {
    totalSteps: steps.length,
    lastCompletedIndex,
    resumingFromIndex: startIndex,
  });

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `step_${i}`;

    // 1. Log step starting
    await appendStep(workflowId, {
      stepName,
      stepIndex: i,
      status: 'running',
      input: context,
    });

    try {
      const result = await step.execute(context);
      if (result && typeof result === 'object') {
        Object.assign(context, result);
      }

      await appendStep(workflowId, {
        stepName,
        stepIndex: i,
        status: 'completed',
        input: context,
        result,
      });

      stepsExecuted.push({ stepName, stepIndex: i, status: 'completed', result });
    } catch (err) {
      await appendStep(workflowId, {
        stepName,
        stepIndex: i,
        status: 'failed',
        input: context,
        error: err.message,
      });
      throw err;
    }
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
}
