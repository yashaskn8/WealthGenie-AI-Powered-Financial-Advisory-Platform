import axios from 'axios';
import { PrometheusMetrics } from './metricsCollector.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Strips JSON schema fields unsupported by Google Gemini FunctionDeclarations API (e.g. additionalProperties, patternProperties).
 */
function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  const clean = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties' || k === 'patternProperties') continue;
    clean[k] = sanitizeGeminiSchema(v);
  }
  return clean;
}

/**
 * Abstract Base Provider Adapter (Phase 9)
 */
export class BaseProviderAdapter {
  constructor(name, costPer1kTokens = 0.0005) {
    this.name = name;
    this.costPer1kTokens = costPer1kTokens;
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
  }

  isHealthy() {
    if (Date.now() < this.circuitOpenUntil) {
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.circuitOpenUntil = 0;
  }

  recordFailure() {
    this.failureCount++;
    if (this.failureCount >= 3) {
      this.circuitOpenUntil = Date.now() + 60000; // Open circuit for 60 seconds
      console.warn(`[ProviderAdapter:${this.name}] Circuit breaker OPENED due to ${this.failureCount} consecutive failures.`);
    }
  }

  supportsTools() { return true; }
  supportsJSON() { return true; }
  supportsStreaming() { return false; }
}

export class GeminiProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('gemini', 0.0004);
  }

  async generate({ systemPrompt, recentHistory, maxTokens = 4096, tools = null }) {
    if (!this.isHealthy()) {
      return null;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: recentHistory,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
      payload.tools = [
        {
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeGeminiSchema(t.parameters),
          })),
        },
      ];
    }

    try {
      const res = await axios.post(GEMINI_API_URL, payload, {
        timeout: 30000,
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      });

      const candidate = res.data?.candidates?.[0];
      if (!candidate || candidate.finishReason === 'SAFETY') {
        this.recordFailure();
        PrometheusMetrics.inc('gemini_failure_total');
        return null;
      }

      const parts = candidate.content?.parts || [];
      const textParts = parts.filter(p => p.text).map(p => p.text);
      const text = textParts.join('');

      const toolCalls = [];
      for (const part of parts) {
        if (part.functionCall) {
          toolCalls.push({
            tool: part.functionCall.name,
            arguments: part.functionCall.args || {},
            raw_part: part,
          });
        }
      }

      const tokensUsed = res.data?.usageMetadata?.totalTokenCount || 0;
      this.recordSuccess();
      PrometheusMetrics.inc('gemini_success_total');
      return {
        text,
        tool_calls: toolCalls,
        tokensUsed,
        provider: this.name,
        wasCompleted: candidate.finishReason === 'STOP' || toolCalls.length > 0,
        estimatedCostUSD: (tokensUsed / 1000) * this.costPer1kTokens,
      };
    } catch (err) {
      this.recordFailure();
      PrometheusMetrics.inc('gemini_failure_total');
      return null;
    }
  }
}

export class GroqProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('groq', 0.0006);
  }

  async generate({ systemPrompt, recentHistory, maxTokens = 4096, tools = null }) {
    if (!this.isHealthy()) {
      return null;
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    for (const m of recentHistory) {
      if (m.parts && Array.isArray(m.parts)) {
        const functionCallParts = m.parts.filter(p => p.functionCall);
        const functionResponseParts = m.parts.filter(p => p.functionResponse);
        const textParts = m.parts.filter(p => p.text).map(p => p.text).join('\n');

        if (functionCallParts.length > 0) {
          messages.push({
            role: 'assistant',
            content: textParts || null,
            tool_calls: functionCallParts.map((p, idx) => ({
              id: `call_${idx}_${p.functionCall.name}`,
              type: 'function',
              function: {
                name: p.functionCall.name,
                arguments: typeof p.functionCall.args === 'string' ? p.functionCall.args : JSON.stringify(p.functionCall.args || {}),
              },
            })),
          });
        } else if (functionResponseParts.length > 0) {
          for (let idx = 0; idx < functionResponseParts.length; idx++) {
            const p = functionResponseParts[idx];
            messages.push({
              role: 'tool',
              tool_call_id: `call_${idx}_${p.functionResponse.name}`,
              name: p.functionResponse.name,
              content: typeof p.functionResponse.response === 'string'
                ? p.functionResponse.response
                : JSON.stringify(p.functionResponse.response || {}),
            });
          }
        } else {
          messages.push({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: textParts || m.content || '',
          });
        }
      } else {
        messages.push({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content || '',
        });
      }
    }

    const body = {
      model: GROQ_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.4,
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    try {
      const res = await axios.post(GROQ_API_URL, body, {
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const choice = res.data?.choices?.[0];
      const message = choice?.message;
      if (!message && !choice) {
        this.recordFailure();
        PrometheusMetrics.inc('groq_failure_total');
        return null;
      }

      const text = message?.content || '';
      const toolCalls = [];
      if (message?.tool_calls && Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
          if (tc.function) {
            let parsedArgs = {};
            try {
              parsedArgs = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments;
            } catch (_) { /* default empty object */ }
            toolCalls.push({
              tool: tc.function.name,
              arguments: parsedArgs,
            });
          }
        }
      }

      const tokensUsed = res.data?.usage?.total_tokens || 0;
      this.recordSuccess();
      PrometheusMetrics.inc('groq_success_total');
      return {
        text,
        tool_calls: toolCalls,
        tokensUsed,
        provider: this.name,
        wasCompleted: choice?.finish_reason === 'stop' || toolCalls.length > 0,
        estimatedCostUSD: (tokensUsed / 1000) * this.costPer1kTokens,
      };
    } catch (err) {
      this.recordFailure();
      PrometheusMetrics.inc('groq_failure_total');
      return null;
    }
  }
}

export class LocalFallbackProviderAdapter extends BaseProviderAdapter {
  constructor() {
    super('local_fallback', 0.0);
  }

  async generate({ fallbackText }) {
    PrometheusMetrics.inc('local_fallback_total');
    return {
      text: fallbackText,
      tokensUsed: 120,
      provider: this.name,
      wasCompleted: true,
      estimatedCostUSD: 0,
    };
  }
}

export const ProviderManager = {
  gemini: new GeminiProviderAdapter(),
  groq: new GroqProviderAdapter(),
  local: new LocalFallbackProviderAdapter(),
};
