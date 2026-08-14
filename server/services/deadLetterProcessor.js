import { getDeadLetters, resumeWorkflow } from './dagStream.js';
import logger from '../utils/logger.js';

/**
 * Dead-Letter Queue (DLQ) Processor
 * Monitors and processes failed agent workflow DAG executions for remediation.
 */
export class DeadLetterProcessor {
  /**
   * Retrieves summary statistics of all dead-lettered workflow steps.
   */
  static async getStats() {
    const deadLetters = await getDeadLetters();
    const uniqueWorkflows = new Set(deadLetters.map(d => d.workflowId));

    return {
      totalDeadLetters: deadLetters.length,
      affectedWorkflowsCount: uniqueWorkflows.size,
      affectedWorkflows: Array.from(uniqueWorkflows),
      recentDeadLetters: deadLetters.slice(-10),
    };
  }

  /**
   * Attempts to reprocess a dead-lettered workflow from its last valid step.
   *
   * @param {string} workflowId
   * @param {Array<object>} stepsDefinition
   * @param {object} context
   * @returns {Promise<object>}
   */
  static async retryWorkflow(workflowId, stepsDefinition, context = {}) {
    logger.info(`DeadLetterProcessor: retrying workflow ${workflowId}`);
    return await resumeWorkflow(workflowId, stepsDefinition, context);
  }
}
