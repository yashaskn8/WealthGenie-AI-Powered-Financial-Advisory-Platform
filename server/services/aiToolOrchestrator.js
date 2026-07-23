import { FinancialToolRegistry } from './financialToolRegistry.js';

/**
 * AI Tool Orchestrator & Dependency Graph Planner (Phase 1 & Phase 2)
 * Resolves tool execution DAGs, executes independent tools in parallel,
 * enforces typed input/output contract validation, and handles partial failures.
 */
export class AIToolOrchestrator {
  /**
   * Plans and executes a graph of tool calls requested by LLM intent.
   *
   * @param {Array<{ tool: string, arguments: object, dependsOn?: Array<string> }>} toolRequests
   * @param {object} context
   * @returns {Promise<{ toolResults: Array<object>, executionGraph: object, totalTimeMs: number }>}
   */
  static async orchestrate(toolRequests = [], context = {}) {
    const startTime = Date.now();
    const resultsMap = new Map();
    const executionGraph = {
      nodes: [],
      edges: [],
      status: 'SUCCESS',
    };

    if (!Array.isArray(toolRequests) || toolRequests.length === 0) {
      return {
        toolResults: [],
        executionGraph,
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Step 1: Topological Sort / Dependency Resolution
    const pending = [...toolRequests];
    const maxPasses = pending.length + 2;
    let passes = 0;

    while (pending.length > 0 && passes < maxPasses) {
      passes++;
      const readyBatch = [];
      const remaining = [];

      for (const req of pending) {
        const deps = req.dependsOn || [];
        const allDepsSatisfied = deps.every(depName => resultsMap.has(depName) && resultsMap.get(depName).success);
        if (allDepsSatisfied) {
          readyBatch.push(req);
        } else {
          remaining.push(req);
        }
      }

      if (readyBatch.length === 0 && remaining.length > 0) {
        // Unresolvable cycle or missing dependency — break and execute remaining independently
        readyBatch.push(...remaining);
        remaining.length = 0;
      }

      // Step 2: Parallel execution of ready tool batch
      const batchPromises = readyBatch.map(req => this.executeWithRetry(req, context));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((res, idx) => {
        const req = readyBatch[idx];
        const execResult = res.status === 'fulfilled'
          ? res.value
          : { tool: req.tool, success: false, error: res.reason?.message || 'Execution error', result: null, execution_time_ms: 0 };

        resultsMap.set(req.tool, execResult);
        executionGraph.nodes.push({
          tool: req.tool,
          arguments: req.arguments,
          success: execResult.success,
          result: execResult.result,
          error: execResult.error,
          executionTimeMs: execResult.execution_time_ms,
          provenance: 'WealthGenie_Financial_Engine_v2',
        });
      });

      pending.length = 0;
      pending.push(...remaining);
    }

    const finalResults = Array.from(resultsMap.values());
    const hasFailures = finalResults.some(r => !r.success);
    executionGraph.status = hasFailures ? 'PARTIAL_SUCCESS' : 'SUCCESS';

    return {
      toolResults: finalResults,
      executionGraph,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Executes a single tool request with retry budget (max 2 retries) and timeout (5000ms).
   */
  static async executeWithRetry(toolReq, context, maxRetries = 2) {
    const { tool, arguments: args } = toolReq;
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool execution timeout (${tool})`)), 5000)
        );

        const execPromise = FinancialToolRegistry.executeTool(tool, args, context);
        const result = await Promise.race([execPromise, timeoutPromise]);

        if (result.success) {
          return { tool, arguments: args, ...result, retriesUsed: attempt - 1 };
        }
        lastError = result.error;
      } catch (err) {
        lastError = err.message;
      }
    }

    return {
      tool,
      arguments: args,
      success: false,
      error: lastError || 'Tool execution failed after retries',
      result: null,
      execution_time_ms: 0,
      retriesUsed: maxRetries,
    };
  }
}
