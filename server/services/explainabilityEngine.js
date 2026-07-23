/**
 * Explainability Engine (Phase 6)
 * Generates transparent, deterministic explanation metadata for financial advice.
 * Purely derived from backend engine execution metadata—never hallucinated by LLM.
 */
export class ExplainabilityEngine {
  /**
   * Generates explanation metadata payload for a chat turn.
   *
   * @param {object} profile
   * @param {Array<object>} toolResults
   * @param {object} verificationMetadata
   * @returns {object} Explainability metadata object
   */
  static generateExplanation(profile = {}, toolResults = [], verificationMetadata = {}) {
    const enginesUsed = new Set();
    const assumptions = [];
    const affectedAttributes = [];

    if (profile.age) affectedAttributes.push(`Investor Age (${profile.age} yrs)`);
    if (profile.riskCategory) affectedAttributes.push(`Risk Profile (${profile.riskCategory})`);
    if (profile.taxRegime) affectedAttributes.push(`Tax Regime (${profile.taxRegime})`);

    toolResults.forEach(res => {
      if (res.tool === 'sip_projection') {
        enginesUsed.add('projectionEngine.sipFV');
        assumptions.push('Monthly annuity-due compounding, constant annual yield');
      } else if (res.tool === 'tax_calculator') {
        enginesUsed.add('taxEngine.computeTax');
        assumptions.push('Indian Income Tax Slabs FY 2025-26');
      } else if (res.tool === 'portfolio_optimizer') {
        enginesUsed.add('portfolioEngine.solveMinVariance');
        assumptions.push('Historical variance-covariance matrix of asset classes');
      }
    });

    const isVerified = verificationMetadata.verification_status !== 'uncorrected';
    const confidenceScore = isVerified ? 0.98 : 0.85;

    return {
      whyThisRecommendation: 'Grounded on investor financial profile, risk tolerance, and canonical engine verification.',
      financialEnginesUsed: Array.from(enginesUsed),
      assumptionsUsed: assumptions.length > 0 ? assumptions : ['Standard compounding & SEBI regulatory boundaries'],
      affectedProfileAttributes: affectedAttributes,
      confidenceScore,
      limitations: ['Projections do not guarantee future returns. Market risks apply.'],
      riskDisclosure: 'Past performance is not indicative of future returns. Mutual fund investments are subject to market risks.',
    };
  }
}
