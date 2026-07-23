/**
 * WealthGenie Production Metrics Collector & Prometheus Exporter (Phase 6)
 * Collects real-time counters, gauges, and histograms for LLM provider health,
 * tool execution accuracy, security events, and system latency.
 */
class MetricsCollector {
  constructor() {
    this.counters = {
      gemini_success_total: 0,
      gemini_failure_total: 0,
      groq_success_total: 0,
      groq_failure_total: 0,
      local_fallback_total: 0,
      tool_execution_total: 0,
      tool_execution_success_total: 0,
      tool_execution_failure_total: 0,
      arithmetic_corrections_total: 0,
      invalid_action_cards_total: 0,
      prompt_injection_attempts_total: 0,
    };

    this.toolUsage = new Map(); // tool_name -> count
    this.latencies = []; // rolling window of latency entries
    this.maxLatencyWindow = 500;
  }

  inc(metricName, value = 1) {
    if (this.counters[metricName] !== undefined) {
      this.counters[metricName] += value;
    }
  }

  recordToolExecution(toolName, success) {
    this.inc('tool_execution_total');
    if (success) {
      this.inc('tool_execution_success_total');
    } else {
      this.inc('tool_execution_failure_total');
    }
    const current = this.toolUsage.get(toolName) || 0;
    this.toolUsage.set(toolName, current + 1);
  }

  recordLatency(provider, latencyMs) {
    if (this.latencies.length >= this.maxLatencyWindow) {
      this.latencies.shift();
    }
    this.latencies.push({ provider, latencyMs, timestamp: Date.now() });
  }

  getPrometheusFormat() {
    const lines = [];
    lines.push('# HELP wealthgenie_chat_requests_total Total count of chat provider requests');
    lines.push('# TYPE wealthgenie_chat_requests_total counter');
    lines.push(`wealthgenie_chat_requests_total{provider="gemini",status="success"} ${this.counters.gemini_success_total}`);
    lines.push(`wealthgenie_chat_requests_total{provider="gemini",status="failure"} ${this.counters.gemini_failure_total}`);
    lines.push(`wealthgenie_chat_requests_total{provider="groq",status="success"} ${this.counters.groq_success_total}`);
    lines.push(`wealthgenie_chat_requests_total{provider="groq",status="failure"} ${this.counters.groq_failure_total}`);
    lines.push(`wealthgenie_chat_requests_total{provider="local_fallback",status="success"} ${this.counters.local_fallback_total}`);

    lines.push('\n# HELP wealthgenie_tool_executions_total Total count of AI tool executions');
    lines.push('# TYPE wealthgenie_tool_executions_total counter');
    lines.push(`wealthgenie_tool_executions_total{status="total"} ${this.counters.tool_execution_total}`);
    lines.push(`wealthgenie_tool_executions_total{status="success"} ${this.counters.tool_execution_success_total}`);
    lines.push(`wealthgenie_tool_executions_total{status="failure"} ${this.counters.tool_execution_failure_total}`);

    for (const [tool, count] of this.toolUsage.entries()) {
      lines.push(`wealthgenie_tool_usage_total{tool="${tool}"} ${count}`);
    }

    lines.push('\n# HELP wealthgenie_security_events_total Count of security and validation events');
    lines.push('# TYPE wealthgenie_security_events_total counter');
    lines.push(`wealthgenie_security_events_total{type="prompt_injection"} ${this.counters.prompt_injection_attempts_total}`);
    lines.push(`wealthgenie_security_events_total{type="invalid_action_cards"} ${this.counters.invalid_action_cards_total}`);
    lines.push(`wealthgenie_security_events_total{type="arithmetic_corrections"} ${this.counters.arithmetic_corrections_total}`);

    const avgLatency = this.latencies.length > 0
      ? (this.latencies.reduce((sum, l) => sum + l.latencyMs, 0) / this.latencies.length).toFixed(2)
      : 0;
    lines.push('\n# HELP wealthgenie_chat_latency_avg_ms Average chat latency in milliseconds');
    lines.push('# TYPE wealthgenie_chat_latency_avg_ms gauge');
    lines.push(`wealthgenie_chat_latency_avg_ms ${avgLatency}`);

    return lines.join('\n');
  }

  getSnapshotJSON() {
    const avgLatency = this.latencies.length > 0
      ? (this.latencies.reduce((sum, l) => sum + l.latencyMs, 0) / this.latencies.length).toFixed(2)
      : 0;

    return {
      counters: { ...this.counters },
      tool_usage: Object.fromEntries(this.toolUsage),
      average_latency_ms: parseFloat(avgLatency),
      recorded_requests_window: this.latencies.length,
      timestamp: new Date().toISOString(),
    };
  }
}

export const PrometheusMetrics = new MetricsCollector();
