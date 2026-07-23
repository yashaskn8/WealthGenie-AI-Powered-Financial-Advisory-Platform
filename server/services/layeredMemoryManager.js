/**
 * Layered Long-Term Memory Architecture & Retrieval Layer (Phase 4 & Phase 5)
 * Constructs optimized, dynamic context windows from layered memory tiers:
 * Working Memory | Profile Memory | Preference Memory | Decision Memory | Tool Memory | System Memory
 */
export class LayeredMemoryManager {
  /**
   * Retrieves and formats compact, highly-relevant context subset for LLM prompt.
   *
   * @param {string} userQuery
   * @param {object} profile
   * @param {Array<object>} goals
   * @param {object} recommendation
   * @param {Array<object>} recentMessages
   * @returns {object} Layered memory context payload
   */
  static buildRetrievedContext(userQuery, profile = {}, goals = [], recommendation = null, recentMessages = []) {
    // 1. Working Memory (Last 5 message turns)
    const workingMemory = recentMessages.slice(-5).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // 2. Profile Memory
    const profileMemory = {
      age: profile.age,
      annualIncome: profile.annualIncome,
      monthlySavings: profile.monthlySavings,
      riskCategory: profile.riskCategory,
    };

    // 3. Preference Memory
    const preferenceMemory = {
      taxRegime: profile.taxRegime || 'new',
      investmentHorizonYears: profile.investmentHorizon || 10,
      equitiesAllocation: profile.recommendedEquityAllocation || 60,
    };

    // 4. Decision Memory (Latest recommendation snippet)
    const decisionMemory = recommendation ? {
      recommendedRegime: recommendation.recommendedRegime,
      equityPct: recommendation.allocation?.equity,
      debtPct: recommendation.allocation?.debt,
    } : null;

    // 5. Tool Memory (Top active goals)
    const toolMemory = goals.slice(0, 3).map(g => ({
      name: g.goal_name || g.name,
      targetAmount: g.target_amount,
      targetYear: g.target_year,
    }));

    // 6. System Memory (Metadata & checksum provenance)
    const systemMemory = {
      promptVersion: '3.0.0',
      policyVersion: '2026.1',
      governanceHash: 'sha256-wealthgenie-v3-governed',
    };

    return {
      workingMemory,
      profileMemory,
      preferenceMemory,
      decisionMemory,
      toolMemory,
      systemMemory,
    };
  }

  /**
   * Formats retrieved memory layers into a clean prompt string.
   */
  static formatForPrompt(retrievedContext) {
    const { profileMemory, preferenceMemory, decisionMemory, toolMemory } = retrievedContext;
    return `
[RETRIEVED PROFILE CONTEXT]
- Investor Age: ${profileMemory.age || 'N/A'}, Risk Profile: ${profileMemory.riskCategory || 'Moderate'}
- Monthly Savings: ₹${profileMemory.monthlySavings?.toLocaleString('en-IN') || '0'}, Annual Income: ₹${profileMemory.annualIncome?.toLocaleString('en-IN') || '0'}
- Preferred Tax Regime: ${preferenceMemory.taxRegime}, Investment Horizon: ${preferenceMemory.investmentHorizonYears} years
${decisionMemory ? `- Latest Strategy: Equity ${decisionMemory.equityPct}%, Debt ${decisionMemory.debtPct}%` : ''}
${toolMemory.length > 0 ? `- Active Goals: ${toolMemory.map(g => `${g.name} (₹${g.targetAmount?.toLocaleString('en-IN')})`).join(', ')}` : ''}
`.trim();
  }
}
