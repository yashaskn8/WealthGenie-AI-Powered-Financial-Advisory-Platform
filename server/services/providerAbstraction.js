import axios from 'axios';
import { PrometheusMetrics } from './metricsCollector.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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

  async generate({ systemPrompt, recentHistory, maxTokens = 4096 }) {
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

      const text = candidate.content?.parts?.map(p => p.text).join('') || '';
      const tokensUsed = res.data?.usageMetadata?.totalTokenCount || 0;
      this.recordSuccess();
      PrometheusMetrics.inc('gemini_success_total');
      return {
        text,
        tokensUsed,
        provider: this.name,
        wasCompleted: candidate.finishReason === 'STOP',
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

  async generate({ systemPrompt, recentHistory, maxTokens = 4096 }) {
    if (!this.isHealthy()) {
      return null;
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.parts.map(p => p.text).join(''),
      })),
    ];

    try {
      const res = await axios.post(GROQ_API_URL, {
        model: GROQ_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.4,
      }, {
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const text = res.data?.choices?.[0]?.message?.content;
      if (!text) {
        this.recordFailure();
        PrometheusMetrics.inc('groq_failure_total');
        return null;
      }

      const tokensUsed = res.data?.usage?.total_tokens || 0;
      this.recordSuccess();
      PrometheusMetrics.inc('groq_success_total');
      return {
        text,
        tokensUsed,
        provider: this.name,
        wasCompleted: res.data?.choices?.[0]?.finish_reason === 'stop',
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
