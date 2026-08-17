/**
 * Genie Chat Service — Dual-provider (Gemini + Groq fallback) v3 Platform Engine
 * Rate limiting, context assembly, API calls, conversation persistence, state machine,
 * provider abstraction, tool orchestrator, explainability, trace graph.
 */
import axios from 'axios';
import { getCache, setCache, redisClient, redisAvailable } from '../config/redis.js';
import { buildSystemPrompt } from './genieChatSystemPrompt.js';
import { createError } from '../middleware/errorHandler.js';
import ConversationHistory from '../models/ConversationHistory.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import Goal from '../models/Goal.js';
import User from '../models/User.js';

import { WealthGenieMcpServer } from '../mcp/wealthgenieMcpServer.js';
import { validateAndSanitizeActionCards } from './actionCardValidator.js';
import { verifyAndCorrectArithmetic } from './arithmeticVerifier.js';
import { inspectPromptSecurity } from './promptSecurity.js';
import { FinancialToolRegistry } from './financialToolRegistry.js';
import { validateAndSanitizeStructuredResponse } from './structuredResponseProtocol.js';
import { ImmutableSecurityPipeline } from './immutableSecurityPipeline.js';
import { PrometheusMetrics } from './metricsCollector.js';
import { ProviderManager } from './providerAbstraction.js';
import { AIToolOrchestrator } from './aiToolOrchestrator.js';
import { ConversationStateMachine, CONVERSATION_STATES } from './conversationStateMachine.js';
import { LayeredMemoryManager } from './layeredMemoryManager.js';
import { ExplainabilityEngine } from './explainabilityEngine.js';
import { ToolTraceGraph, promptVersion, policyVersion } from './toolTraceGraph.js';
import { queryRAG } from './ragClient.js';
import { isFactualQuery } from './intentGate.js';

const CHAT_RATE_LIMIT = 30;
const HISTORY_WINDOW = 20;
const MAX_OUTPUT_TOKENS = 4096;
const SYSTEM_PROMPT_TTL = 1800;

// STATELESS: Rate limits are stored strictly in Redis. No in-memory Map fallback.
async function checkRateLimit(userId) {
  const key = `chat:ratelimit:${userId}`;
  if (redisClient && redisAvailable) {
    try {
      const count = await redisClient.incr(key);
      if (count === 1) await redisClient.expire(key, 3600);
      if (count > CHAT_RATE_LIMIT) {
        const ttl = await redisClient.ttl(key);
        return { allowed: false, count, ttl };
      }
      return { allowed: true, count };
    } catch (_) { /* fallthrough */ }
  }
  // Without Redis, allow request to avoid in-memory state divergence across instances
  return { allowed: true, count: 1 };
}

/**
 * Constructs the client-facing Chat Response DTO.
 * 
 * Explicitly sanitizes and restricts the payload sent over the wire to only
 * fields consumed by the UI (response text, session ID, latency, citations,
 * action cards, and rate limiting status).
 * 
 * Internal execution graphs, raw tool outputs, replan traces, governance graphs,
 * pre-compliance raw LLM strings, and raw vector store embeddings are strictly
 * omitted from this DTO and retained exclusively in MongoDB conversation audit metadata.
 */
export function buildClientResponseDTO({
  version = '3.0',
  response,
  session_id,
  latency_ms = 0,
  grounded = true,
  provider = 'gemini',
  messages_this_hour = 1,
  rate_limit_remaining = 30,
  citations = [],
  action_cards = [],
}) {
  return {
    version,
    response,
    session_id,
    latency_ms,
    grounded,
    provider,
    messages_this_hour,
    rate_limit_remaining,
    citations,
    action_cards,
  };
}

export async function processChat({ userId, user, message, sessionId }) {
  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    throw createError(429, `Rate limit for user ${userId}`, `Chat limit reached (${CHAT_RATE_LIMIT}/hour). Resets in ${Math.ceil(rateCheck.ttl / 60)} minutes.`);
  }

  const profile = await FinancialProfile.findOne({ userId }).sort({ createdAt: -1 }).lean();
  if (!profile) {
    return buildClientResponseDTO({
      version: '3.0',
      response: "I don't have your financial profile yet. Please complete the profile setup on the home page so I can give you personalised advice.",
      session_id: sessionId,
      grounded: false,
      provider: 'system',
      messages_this_hour: rateCheck.count,
      rate_limit_remaining: CHAT_RATE_LIMIT - rateCheck.count,
      citations: [],
      action_cards: [],
    });
  }

  // Phase 5: Multi-layer Immutable Security Pipeline
  const securityContext = ImmutableSecurityPipeline.processInput(message, profile);
  if (securityContext.isInjection) {
    PrometheusMetrics.inc('prompt_injection_attempts_total');
  }

  const recommendation = await Recommendation.findOne({ userId, profileId: profile._id }).sort({ generatedAt: -1 }).lean();
  const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).lean();

  const fullUser = await User.findById(userId).lean() || { name: user.email, email: user.email };

  let conversation = await ConversationHistory.findOne({ userId, session_id: sessionId, is_active: true });
  if (!conversation) {
    conversation = new ConversationHistory({ userId, profileId: profile._id, session_id: sessionId, messages: [] });
  }

  // Phase 4 & Phase 5: Layered Long-Term Memory & Context Retrieval
  const retrievedMemory = LayeredMemoryManager.buildRetrievedContext(message, profile, goals, recommendation, conversation.messages);
  const formattedMemoryContext = LayeredMemoryManager.formatForPrompt(retrievedMemory);

  const promptCacheKey = `chat:sysprompt_v3:${userId}:${profile._id}:${goals.length}:${recommendation?.generatedAt || 'none'}`;
  let baseSystemPrompt = await getCache(promptCacheKey);
  if (!baseSystemPrompt) {
    let marketData = null;
    try { const cached = await getCache('index:stats:^NSEI'); marketData = cached ? { nifty: cached } : null; } catch (err) { console.warn('[GeminiChatService] Redis cache read failed:', err.message); }
    baseSystemPrompt = buildSystemPrompt(fullUser, profile, recommendation, marketData, goals);
    await setCache(promptCacheKey, baseSystemPrompt, SYSTEM_PROMPT_TTL);
  }

  const systemPrompt = `${baseSystemPrompt}\n\n${formattedMemoryContext}`;

  // ── Phase 1 Architecture Truth: Hybrid RAG Routing for Factual/Regulatory Queries ──
  if (isFactualQuery(message)) {
    console.info(`[Chat] Message classified as factual/regulatory. Routing to FastAPI RAG service: "${message.substring(0, 60)}..."`);
    const ragResult = await queryRAG({ query: securityContext.sanitizedMessage, userId });
    if (ragResult && ragResult.answer) {
      console.info(`[Chat] RAG retrieval successful (${ragResult.citations?.length || 0} citations). Returning grounded response.`);

      const responseText = ImmutableSecurityPipeline.enforceCompliance(ragResult.answer);

      const ragAuditMetadata = {
        strategy: 'rag_retrieval',
        provider: 'rag',
        grounded: ragResult.grounded !== undefined ? ragResult.grounded : true,
        citations: ragResult.citations || [],
        retrieved_chunks: ragResult.retrieved_chunks || [],
        metrics: ragResult.metrics || {},
        governance: { compliance: 'SEBI/AMFI grounded RAG retrieval', trust_tier: 'verified' },
        explainability: { rag_citations: ragResult.citations || [] },
        verification: { verification_status: 'grounded_rag', verified: true, source: 'fastapi_rag' },
        timestamp: new Date().toISOString(),
      };

      // Persist full audit record in MongoDB conversation history
      conversation.messages.push({ role: 'user', content: securityContext.sanitizedMessage, timestamp: new Date() });
      conversation.messages.push({ role: 'model', content: responseText, metadata: ragAuditMetadata, timestamp: new Date() });
      await conversation.save();

      try { PrometheusMetrics.inc('rag_queries_total'); } catch (_) {}

      // Sanitize citations: expose only user-facing display fields
      const sanitizedCitations = (ragResult.citations || []).map((c, i) => ({
        citation_id: c.citation_id ?? i + 1,
        document_title: c.document_title || 'Regulatory Document',
        source: c.source || 'Knowledge Base',
        chunk_id: c.chunk_id || `chunk_${i + 1}`,
        excerpt: c.excerpt || '',
        relevance_score: c.relevance_score ?? 1.0,
      }));

      return buildClientResponseDTO({
        version: '3.0',
        response: responseText,
        session_id: sessionId,
        latency_ms: ragResult.metrics?.total_latency_ms || 100,
        grounded: ragResult.grounded !== undefined ? ragResult.grounded : true,
        provider: 'rag',
        messages_this_hour: rateCheck.count,
        rate_limit_remaining: CHAT_RATE_LIMIT - rateCheck.count,
        citations: sanitizedCitations,
        action_cards: [],
      });
    } else {
      console.warn('[Chat] RAG service unavailable or returned empty answer. Falling back to dual-provider LLM pipeline.');
    }
  }

  const SESSION_CUMULATIVE_TOKEN_CAP = 50000;
  const SESSION_MAX_HOPS_CAP = 20;
  const TURN_CUMULATIVE_TOKEN_CAP = 12000;
  const MAX_REPLANS = 2;

  // Session-Level Safety Budget Check
  if ((conversation.cumulative_tokens || 0) >= SESSION_CUMULATIVE_TOKEN_CAP) {
    console.warn(`[Chat:SafetyLimit] Session ${sessionId} exceeded cumulative token budget (${conversation.cumulative_tokens} >= ${SESSION_CUMULATIVE_TOKEN_CAP}). Gracefully terminating.`);
    const safetyNotice = `⚠️ **Session Safety Limit Reached**: This chat session has reached its cumulative reasoning token budget (50,000 tokens). To ensure cost safety and prevent runaway execution loops, automated calculations have concluded for this session. You may continue in a fresh session or review the verified guidance below.`;
    const fallbackText = generateLocalFallbackResponse(fullUser, profile, goals, message);
    const finalMsg = `${safetyNotice}\n\n${fallbackText}`;

    const safetyAuditMetadata = {
      safety_limit_triggered: true,
      safety_limit_reason: 'SESSION_CUMULATIVE_TOKEN_CAP_EXCEEDED',
      cumulative_session_tokens: conversation.cumulative_tokens,
      provider: 'safety_circuit_breaker',
      state: 'SafetyTerminated',
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push({ role: 'user', content: message, metadata: { grounded_on_profile: true } });
    conversation.messages.push({ role: 'model', content: finalMsg, metadata: safetyAuditMetadata, timestamp: new Date() });
    await conversation.save();

    return buildClientResponseDTO({
      version: '3.0',
      response: finalMsg,
      session_id: sessionId,
      latency_ms: 50,
      grounded: true,
      provider: 'safety_circuit_breaker',
      messages_this_hour: rateCheck.count,
      rate_limit_remaining: CHAT_RATE_LIMIT - rateCheck.count,
      citations: [],
      action_cards: [],
    });
  }

  const recentHistory = conversation.messages.slice(-HISTORY_WINDOW).map(m => ({ role: m.role, parts: [{ text: m.content }] }));
  recentHistory.push({ role: 'user', parts: [{ text: securityContext.sanitizedMessage }] });

  const startTime = Date.now();
  const mcpTools = WealthGenieMcpServer.getToolDefinitions();

  // ── PASS 1: Provider-Native Call + MCP Tool Definitions ──
  let result = await ProviderManager.gemini.generate({ systemPrompt, recentHistory, maxTokens: MAX_OUTPUT_TOKENS, tools: mcpTools });
  if (!result) {
    console.info('[Chat] Gemini adapter unavailable/failed, falling back to Groq adapter...');
    result = await ProviderManager.groq.generate({ systemPrompt, recentHistory, maxTokens: MAX_OUTPUT_TOKENS, tools: mcpTools });
  }

  let isFallback = false;
  if (!result) {
    console.info('[Chat] Dual providers failed, executing local fallback adapter...');
    isFallback = true;
    const fallbackText = generateLocalFallbackResponse(fullUser, profile, goals, message);
    result = await ProviderManager.local.generate({ fallbackText });
  }

  let nativeToolCalls = result.tool_calls || [];
  let v2Protocol = { answer: result.text || '', tool_calls: [] };

  // Native Precedence Rule: If native function calls are present, skip text-blob tool parsing.
  if (nativeToolCalls.length === 0 && result.text) {
    v2Protocol = validateAndSanitizeStructuredResponse(result.text);
    if (v2Protocol.tool_calls && v2Protocol.tool_calls.length > 0) {
      nativeToolCalls = v2Protocol.tool_calls;
    }
  }

  let toolResults = [];
  let orchestration = { toolResults: [], executionGraph: { status: 'NO_TOOLS' } };
  let executedTwoPass = false;

  let replanCount = 0;
  let totalTurnTokens = result.tokensUsed || 0;
  const replanTrace = [];
  let currentToolCalls = nativeToolCalls;
  const allExecutedToolResults = [];
  let safetyLimitTriggered = false;
  let safetyLimitReason = null;

  // ── PASS 2 & REPLANNING LOOP: Execute Tools & Self-Correct / Replan Grounded in Outputs ──
  while (currentToolCalls.length > 0 && replanCount <= MAX_REPLANS && !isFallback) {
    console.info(`[Chat] Executing Tool Batch (Pass ${replanCount + 1}, ${currentToolCalls.length} tool(s): ${currentToolCalls.map(t => t.tool).join(', ')})...`);
    orchestration = await AIToolOrchestrator.orchestrate(currentToolCalls, { profile, user: fullUser });
    const stepResults = orchestration.toolResults;
    allExecutedToolResults.push(...stepResults);
    toolResults = allExecutedToolResults;

    // Append functionCall turn to history
    recentHistory.push({
      role: 'model',
      parts: currentToolCalls.map(tc => ({ functionCall: { name: tc.tool, args: tc.arguments } })),
    });

    // Append functionResponse turn to history
    recentHistory.push({
      role: 'user',
      parts: stepResults.map(tr => ({
        functionResponse: {
          name: tr.tool,
          response: tr.success ? tr.result : {
            error: tr.error,
            status: 'FAILED',
            hint: 'Check required parameters, value boundaries (e.g. annualRate must be decimal <= 0.50), or select an alternative tool.',
          },
        },
      })),
    });

    // Check token safety budget before calling LLM
    if (totalTurnTokens >= TURN_CUMULATIVE_TOKEN_CAP) {
      safetyLimitTriggered = true;
      safetyLimitReason = 'TURN_CUMULATIVE_TOKEN_CAP_EXCEEDED';
      console.warn(`[Chat:SafetyLimit] Cumulative turn token budget exceeded (${totalTurnTokens} >= ${TURN_CUMULATIVE_TOKEN_CAP}). Terminating replanning loop gracefully.`);
      break;
    }

    if (((conversation.cumulative_hops || 0) + replanCount) >= SESSION_MAX_HOPS_CAP) {
      safetyLimitTriggered = true;
      safetyLimitReason = 'SESSION_MAX_HOPS_CAP_EXCEEDED';
      console.warn(`[Chat:SafetyLimit] Cumulative session hop limit reached (${SESSION_MAX_HOPS_CAP}). Terminating replanning loop.`);
      break;
    }

    console.info(`[Chat] Calling LLM grounded in tool outputs (Pass/Replan #${replanCount + 1})...`);
    let nextResult = await ProviderManager.gemini.generate({ systemPrompt, recentHistory, maxTokens: MAX_OUTPUT_TOKENS, tools: mcpTools })
      || await ProviderManager.groq.generate({ systemPrompt, recentHistory, maxTokens: MAX_OUTPUT_TOKENS, tools: mcpTools });

    if (!nextResult) {
      console.warn('[Chat] LLM replan pass returned null, terminating tool loop.');
      break;
    }

    totalTurnTokens += nextResult.tokensUsed || 0;
    executedTwoPass = true;

    // Inspect if LLM requested another tool call (replanning / tool chaining / parameter correction)
    let nextToolCalls = nextResult.tool_calls || [];
    if (nextToolCalls.length === 0 && nextResult.text) {
      const parsed = validateAndSanitizeStructuredResponse(nextResult.text);
      if (parsed.tool_calls && parsed.tool_calls.length > 0) {
        nextToolCalls = parsed.tool_calls;
      }
    }

    const hasFailures = stepResults.some(r => !r.success);

    if (nextToolCalls.length > 0) {
      if (replanCount < MAX_REPLANS) {
        replanCount++;
        const triggerReason = hasFailures ? 'TOOL_FAILURE_CORRECTION' : 'REASONING_DRIVEN_TOOL_ADJUSTMENT';
        console.info(`[Chat:Replan] Triggered Replan #${replanCount} (trigger: ${triggerReason}). Next tool(s): ${nextToolCalls.map(t => t.tool).join(', ')}`);

        replanTrace.push({
          replanIndex: replanCount,
          trigger: triggerReason,
          failedTools: stepResults.filter(r => !r.success).map(r => ({ tool: r.tool, error: r.error })),
          previousToolCalls: currentToolCalls,
          nextToolCalls: nextToolCalls,
        });

        currentToolCalls = nextToolCalls;
      } else {
        console.info(`[Chat:Replan] Max replans reached (${MAX_REPLANS}). Forcing final grounded response.`);
        safetyLimitTriggered = hasFailures;
        if (hasFailures) safetyLimitReason = 'MAX_REPLANS_EXHAUSTED_WITH_FAILURES';
        result = nextResult;
        currentToolCalls = [];
      }
    } else {
      // LLM generated final grounded text response without further tool requests
      result = nextResult;
      currentToolCalls = [];
    }
  }

  const latencyMs = Date.now() - startTime;
  const rawResponseText = result.text;
  const tokensUsed = result.tokensUsed;
  const provider = result.provider;
  const wasCompleted = result.wasCompleted;

  PrometheusMetrics.recordLatency(provider, latencyMs);

  let responseText = rawResponseText;

  // User-facing Safety Limit Notification if replan loop was terminated by budget/replan caps with failures
  if (safetyLimitTriggered && safetyLimitReason) {
    responseText = `⚠️ **Session Safety Limit Notice**: The automated reasoning engine reached the maximum calculation depth limit (${safetyLimitReason.replace(/_/g, ' ')}). Below is the guidance compiled from verified steps:\n\n${responseText}`;
  }

  // Server-Side ACTION_CARD Validation
  const { cleanedText, validCards, validationSummary } = validateAndSanitizeActionCards(responseText);
  responseText = cleanedText;

  // Independent Arithmetic Verification (Safety Net)
  const { verifiedText, verificationMetadata } = verifyAndCorrectArithmetic(responseText, profile);
  responseText = verifiedText;

  // If post-Pass-2 verification was required, record metric
  if (executedTwoPass && verificationMetadata.corrected_fields && verificationMetadata.corrected_fields.length > 0) {
    PrometheusMetrics.inc('arithmetic_corrections_post_pass2_total');
    console.warn(`[Chat] Post-Pass-2 arithmetic correction fired for fields: ${verificationMetadata.corrected_fields.join(', ')}`);
  }

  // Phase 5: Enforce Regulatory Compliance
  responseText = ImmutableSecurityPipeline.enforceCompliance(responseText);

  // Phase 3: Conversation State Machine Transition
  const stateTransition = ConversationStateMachine.transition(CONVERSATION_STATES.IDLE, {
    userMessage: message,
    hasTools: v2Protocol.tool_calls?.length > 0,
    toolResults,
    isFallback,
  });

  // Phase 6: Explainability Engine Metadata Generation
  const explanationMetadata = ExplainabilityEngine.generateExplanation(profile, toolResults, verificationMetadata);

  // Phase 7 & Phase 16: Tool Trace Graph & Governance
  const traceGraph = ToolTraceGraph.buildTraceGraph({
    sessionId,
    userId,
    userMessage: message,
    stateTransition,
    provider,
    retrievedContext: retrievedMemory,
    executionGraph: orchestration.executionGraph,
    verificationMetadata,
    explanationMetadata,
    responseText,
  });

  console.info(`[Chat] [${provider}] State: ${stateTransition.nextState}. Response: ${responseText.length} chars. Tools: ${toolResults.length}. Replans: ${replanCount}. Verif: ${verificationMetadata.verification_status}.`);

  // Phase 7 & Phase 16: Complete Multi-Stage Governance Audit Persistence
  const auditMetadata = {
    original_llm_response: rawResponseText,
    validated_v2_protocol: v2Protocol,
    tool_requests: v2Protocol.tool_calls,
    tool_outputs: toolResults,
    replans: replanTrace,
    replan_count: replanCount,
    safety_limit_triggered: safetyLimitTriggered,
    safety_limit_reason: safetyLimitReason,
    execution_graph: orchestration.executionGraph,
    corrections_applied: verificationMetadata.corrected_fields,
    final_response: responseText,
    provider,
    state: stateTransition.nextState,
    explainability: explanationMetadata,
    governance: traceGraph.governance,
    tokens_used: totalTurnTokens,
    cumulative_session_tokens: (conversation.cumulative_tokens || 0) + totalTurnTokens,
    latency_ms: latencyMs,
    grounded_on_profile: true,
    disclaimer_appended: true,
    action_cards: validCards,
    action_cards_summary: validationSummary,
    arithmetic_verification: verificationMetadata,
    timestamp: new Date().toISOString(),
  };

  conversation.cumulative_tokens = (conversation.cumulative_tokens || 0) + totalTurnTokens;
  conversation.cumulative_hops = (conversation.cumulative_hops || 0) + (replanCount + 1);

  conversation.messages.push({ role: 'user', content: message, metadata: { grounded_on_profile: true, prompt_injection_detected: securityContext.isInjection } });
  conversation.messages.push({
    role: 'model',
    content: responseText,
    metadata: auditMetadata,
  });
  await conversation.save();

  // Sanitize citations if any explainability citations exist
  const clientCitations = (explanationMetadata?.rag_citations || []).map((c, i) => ({
    citation_id: c.citation_id ?? i + 1,
    document_title: c.document_title || 'Regulatory Document',
    source: c.source || 'Knowledge Base',
    chunk_id: c.chunk_id || `chunk_${i + 1}`,
    excerpt: c.excerpt || '',
    relevance_score: c.relevance_score ?? 1.0,
  }));

  return buildClientResponseDTO({
    version: '3.0',
    response: responseText,
    session_id: sessionId,
    latency_ms: latencyMs,
    grounded: true,
    provider,
    messages_this_hour: rateCheck.count,
    rate_limit_remaining: CHAT_RATE_LIMIT - rateCheck.count,
    citations: clientCitations,
    action_cards: validCards,
  });
}

function generateLocalFallbackResponse(user, profile, goals, message) {
  const age = profile.age || 30;
  const income = profile.income || 0;
  const annualIncome = profile.annualIncome || (income * 12) || 0;
  const savings = profile.savings || 0;
  const risk = profile.riskCategory || 'Moderate';
  const regime = profile.taxRegime || 'new';
  const horizon = profile.investmentHorizon || 15;
  const recommendedEquity = profile.recommendedEquityAllocation || 50;

  const msg = message.toLowerCase();
  
  let dynamicResponse = `Hello ${user.name || 'Investor'}! While I'm experiencing temporary connectivity issues with my core brain models, I can still provide expert guidance grounded in your active financial profile.

`;

  if (msg.includes('rebalance') || msg.includes('allocat')) {
    dynamicResponse += `**Portfolio Allocation & Rebalancing Guidance:**
Based on your profile as a **${age}-year-old ${risk} investor**, my recommended target allocation is **${recommendedEquity}% Equity** and **${100 - recommendedEquity}% Debt/Fixed Income**. 

To optimize this:
1. Check if your current allocations have drifted by more than 5% due to recent market moves.
2. Direct your monthly savings of **₹${savings.toLocaleString('en-IN')}/month** to under-allocated segments to rebalance naturally without triggering capital gains taxes.
3. Utilize our built-in **Portfolio Rebalancer** in the sidebar to simulate custom weights.

<<<ACTION_CARD>>>
{
  "type": "rebalance",
  "title": "Natural Rebalancer Action",
  "subtitle": "Align with your ${risk} profile",
  "metrics": [
    { "label": "Target Equity", "value": "${recommendedEquity}%", "trend": "neutral" },
    { "label": "Monthly SIP", "value": "₹${savings.toLocaleString('en-IN')}", "trend": "up" }
  ],
  "actions": [
    { "label": "Open Rebalancer", "action": "navigate", "target": "/rebalancer" }
  ],
  "severity": "info",
  "insight": "Keep transaction costs low by using new SIP inflows of ₹${savings.toLocaleString('en-IN')} to rebalance instead of selling."
}
<<<END_ACTION_CARD>>>`;
  } else if (msg.includes('tax') || msg.includes('slab') || msg.includes('regime')) {
    const stdDeduction = regime === 'new' ? 75000 : 50000;
    const taxable = Math.max(0, annualIncome - stdDeduction);
    
    dynamicResponse += `**Tax Optimization Guidance (${regime.toUpperCase()} Regime):**
Your profile is set to the **${regime.toUpperCase()} Regime** with a monthly income of **₹${income.toLocaleString('en-IN')}** (Annualized: ₹${annualIncome.toLocaleString('en-IN')}). Under current tax provisions:
1. Standard deduction of **₹${stdDeduction.toLocaleString('en-IN')}** has been automatically factored into your computed taxable income of **₹${taxable.toLocaleString('en-IN')}**.
2. If you want to explore old regime tax deductions like Section 80C or Section 80CCD(1B) for NPS, head over to our **Tax Optimizer** screen.
3. Consider utilizing tax-shielded instruments to optimize LTCG under the new regime.

<<<ACTION_CARD>>>
{
  "type": "tax_save",
  "title": "Regime Comparer Analysis",
  "subtitle": "Maximize take-home salary",
  "metrics": [
    { "label": "Taxable Income", "value": "₹${taxable.toLocaleString('en-IN')}", "trend": "down" },
    { "label": "Active Regime", "value": "${regime.toUpperCase()}", "trend": "neutral" }
  ],
  "actions": [
    { "label": "Optimize Tax", "action": "navigate", "target": "/tax" }
  ],
  "severity": "success",
  "insight": "Run a simulation on our Tax Optimizer tool to confirm if standard new regime slabs are more efficient for your ₹${annualIncome.toLocaleString('en-IN')}/yr bracket."
}
<<<END_ACTION_CARD>>>`;
  } else if (msg.includes('sip') || msg.includes('grow') || msg.includes('step') || msg.includes('horizon')) {
    dynamicResponse += `**Wealth Projection & Step-Up Strategy:**
You currently save **₹${savings.toLocaleString('en-IN')}/month** with an investment horizon of **${horizon} years**. 

By applying an annual SIP Step-Up:
1. Increasing your SIP by **10% every year** can significantly multiply your terminal corpus through compounding.
2. Rupee-cost averaging helps neutralize short-term market corrections.
3. Run simulations in the **SIP Step-Up Planner** to see flat vs. step-up trajectory charts.

<<<ACTION_CARD>>>
{
  "type": "sip_stepup",
  "title": "Compounding Booster",
  "subtitle": "Apply 10% annual increase",
  "metrics": [
    { "label": "Current SIP", "value": "₹${savings.toLocaleString('en-IN')}", "trend": "neutral" },
    { "label": "Horizon", "value": "${horizon} Yrs", "trend": "neutral" }
  ],
  "actions": [
    { "label": "Plan Step-Up", "action": "navigate", "target": "/stepup" }
  ],
  "severity": "info",
  "insight": "A simple 10% step-up on your ₹${savings.toLocaleString('en-IN')} monthly savings can expand your terminal wealth by over 40%."
}
<<<END_ACTION_CARD>>>`;
  } else {
    // General default fallback
    const goalStr = goals.length > 0 ? goals.map(g => g.goal_name).join(', ') : 'Wealth Growth';
    dynamicResponse += `**WealthGenie Action Plan for ${user.name || 'Investor'}:**
Grounding my responses in your current profile:
1. **Age**: ${age} (Investment Horizon: ${horizon} years).
2. **Monthly Budget**: ₹${savings.toLocaleString('en-IN')} savings capacity.
3. **Core Goals**: ${goalStr}.

Feel free to ask me to analyze:
1. **Rebalancing** your assets.
2. **Tax optimization** between regimes.
3. **Compounding simulations** for your goals.`;
  }

  // Mandatory regulatory disclaimer for all investment advisory outputs (SEBI IA Regulations, 2013)
  dynamicResponse += `\n\n*For informational purposes only. Not registered investment advice under SEBI (IA) Regulations, 2013. Consult a SEBI-registered adviser before investing. Mutual fund investments are subject to market risks.*`;

  return dynamicResponse;
}
