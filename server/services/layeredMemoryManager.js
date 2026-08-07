import crypto from 'crypto';

const _midTermStores = new Map();
const _longTermStores = new Map();
const _governanceLedgers = new Map();
const INITIAL_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function computeCanonicalHash(obj) {
  return crypto.createHash('sha256').update(canonicalStringify(obj)).digest('hex');
}

function computeChecksum(key, value) {
  return computeCanonicalHash({ key, value });
}

/**
 * Layered Long-Term Memory Architecture & Retrieval Layer (Phase 4 & Phase 5)
 * Constructs optimized, dynamic context windows from layered memory tiers:
 * Working Memory | Profile Memory | Preference Memory | Decision Memory | Tool Memory | System Memory
 */
export class LayeredMemoryManager {
  static resetStores() {
    _midTermStores.clear();
    _longTermStores.clear();
    _governanceLedgers.clear();
  }

  static _getGovernanceLedger(userId) {
    if (!_governanceLedgers.has(userId)) {
      _governanceLedgers.set(userId, []);
    }
    return _governanceLedgers.get(userId);
  }

  static _appendAuditEntry(userId, key, value) {
    const ledger = this._getGovernanceLedger(userId);
    const prevChainHash = ledger.length > 0 ? ledger[ledger.length - 1].chainHash : INITIAL_HASH;
    const itemHash = computeCanonicalHash({ key, value });
    const chainHash = computeCanonicalHash({ prevChainHash, itemHash, key });
    const entry = { itemHash, prevChainHash, chainHash, key };
    ledger.push(entry);
    return entry;
  }

  static verifyMemoryAuditChain(userId) {
    const ledger = _governanceLedgers.get(userId) || [];
    if (ledger.length === 0) {
      return { valid: true, chainLength: 0, headHash: null };
    }

    for (let i = 0; i < ledger.length; i++) {
      const entry = ledger[i];
      const expectedPrevHash = i === 0 ? INITIAL_HASH : ledger[i - 1].chainHash;

      if (entry.prevChainHash !== expectedPrevHash) {
        return { valid: false, brokenIndex: i, reason: 'PREV_HASH_MISMATCH' };
      }

      const recomputedChainHash = computeCanonicalHash({
        prevChainHash: entry.prevChainHash,
        itemHash: entry.itemHash,
        key: entry.key,
      });

      if (entry.chainHash !== recomputedChainHash) {
        return { valid: false, brokenIndex: i, reason: 'CHAIN_HASH_MISMATCH' };
      }
    }

    return {
      valid: true,
      chainLength: ledger.length,
      headHash: ledger[ledger.length - 1].chainHash,
    };
  }

  static _getLongTermStore(userId) {
    if (!_longTermStores.has(userId)) {
      _longTermStores.set(userId, new Map());
    }
    return _longTermStores.get(userId);
  }

  static saveMidTermMemory({ userId, sessionId, key, value, ttlMs = 3600000 }) {
    if (!_midTermStores.has(userId)) {
      _midTermStores.set(userId, new Map());
    }
    const userStore = _midTermStores.get(userId);
    const checksum = computeChecksum(key, value);
    userStore.set(key, {
      userId,
      sessionId,
      key,
      value,
      checksum,
      expiresAt: Date.now() + ttlMs,
      timestamp: Date.now(),
    });
    this._appendAuditEntry(userId, key, value);
  }

  static getActiveMidTermMemories(userId, now = Date.now()) {
    const userStore = _midTermStores.get(userId);
    if (!userStore) return [];
    const active = [];
    for (const [key, item] of userStore.entries()) {
      if (item.expiresAt > now) {
        const expectedChecksum = computeChecksum(item.key, item.value);
        if (item.checksum === expectedChecksum) {
          active.push(item);
        } else {
          console.warn(`[LayeredMemory] Tampering detected on mid-term memory '${key}' for user ${userId}. Excluding.`);
        }
      }
    }
    return active;
  }

  static saveLongTermFact({ userId, key, value }) {
    const userStore = this._getLongTermStore(userId);
    const checksum = computeChecksum(key, value);
    userStore.set(key, { key, value, checksum });
    this._appendAuditEntry(userId, key, value);
  }

  static getLongTermFacts(userId) {
    const userStore = _longTermStores.get(userId);
    if (!userStore) return {};
    const facts = {};
    for (const [key, entry] of userStore.entries()) {
      const expectedChecksum = computeChecksum(key, entry.value);
      if (entry.checksum === expectedChecksum) {
        facts[key] = entry.value;
      } else {
        console.warn(`[LayeredMemory] Tampering detected on long-term fact '${key}' for user ${userId}. Excluding from context.`);
      }
    }
    return facts;
  }

  static scoreAndSelectMemories(userQuery = '', memories = [], topN = 3, now = Date.now()) {
    const qLower = (userQuery || '').toLowerCase();
    const qWords = qLower.split(/\W+/).filter(w => w.length > 2);

    const scored = memories.map(m => {
      const text = `${m.key || ''} ${m.value || ''}`.toLowerCase();
      let relevance = 0;
      for (const w of qWords) {
        if (text.includes(w)) relevance += 1.0;
      }
      const ageMs = Math.max(0, now - (m.timestamp || now));
      const recency = Math.exp(-ageMs / (3600 * 1000 * 24)); // 1-day half-life decay
      const combinedScore = relevance * 2.0 + recency;
      return { ...m, relevanceScore: relevance, recencyScore: recency, combinedScore };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    return scored.slice(0, topN);
  }

  /**
   * Retrieves and formats compact, highly-relevant context subset for LLM prompt.
   *
   * @param {string} userQuery
   * @param {object} profile
   * @param {Array<object>} goals
   * @param {object} recommendation
   * @param {Array<object>} recentMessages
   * @param {object} [options]
   * @returns {object} Layered memory context payload
   */
  static buildRetrievedContext(userQuery, profile = {}, goals = [], recommendation = null, recentMessages = [], options = {}) {
    const userId = profile.userId || options.userId;
    const now = options.now || Date.now();

    // 1. Working Memory (Last 5 message turns)
    const workingMemory = recentMessages.slice(-5).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // 2. Profile Memory (including verified long-term facts)
    const longTermFacts = userId ? this.getLongTermFacts(userId) : {};
    const profileMemory = {
      age: profile.age,
      annualIncome: profile.annualIncome,
      monthlySavings: profile.monthlySavings,
      riskCategory: profile.riskCategory,
      ...longTermFacts,
    };

    // 3. Mid-Term Memory
    const midTermMemory = userId ? this.getActiveMidTermMemories(userId, now) : [];

    // 4. Preference Memory
    const preferenceMemory = {
      taxRegime: profile.taxRegime || 'new',
      investmentHorizonYears: profile.investmentHorizon || 10,
      equitiesAllocation: profile.recommendedEquityAllocation || 60,
    };

    // 5. Decision Memory (Latest recommendation snippet)
    const decisionMemory = recommendation ? {
      recommendedRegime: recommendation.recommendedRegime,
      equityPct: recommendation.allocation?.equity,
      debtPct: recommendation.allocation?.debt,
    } : null;

    // 6. Tool Memory (Top active goals)
    const toolMemory = goals.slice(0, 3).map(g => ({
      name: g.goal_name || g.name,
      targetAmount: g.target_amount,
      targetYear: g.target_year,
    }));

    // 7. System Memory (Metadata & checksum provenance)
    const promptVersionInfo = { promptVersion: '3.0.0', policyVersion: '2026.1' };
    const auditResult = userId ? this.verifyMemoryAuditChain(userId) : { valid: true, headHash: null };
    const systemMemory = {
      ...promptVersionInfo,
      checksum: computeCanonicalHash(promptVersionInfo),
      integrityVerified: auditResult.valid,
      chainHeadHash: auditResult.headHash,
      governanceHash: computeCanonicalHash({
        workingMemory,
        profileMemory,
        midTermMemory,
        preferenceMemory,
        decisionMemory,
        toolMemory,
      }),
    };

    return {
      workingMemory,
      profileMemory,
      midTermMemory,
      preferenceMemory,
      decisionMemory,
      toolMemory,
      systemMemory,
    };
  }

  static formatForPrompt(contextPayload) {
    if (!contextPayload) return '';
    const { profileMemory, preferenceMemory, decisionMemory, toolMemory } = contextPayload;
    const parts = [];
    if (profileMemory) {
      parts.push(`PROFILE: ${JSON.stringify(profileMemory)}`);
    }
    if (contextPayload.midTermMemory && contextPayload.midTermMemory.length > 0) {
      parts.push(`MID-TERM MEMORY: ${JSON.stringify(contextPayload.midTermMemory)}`);
    }
    if (preferenceMemory) {
      parts.push(`PREFERENCES: ${JSON.stringify(preferenceMemory)}`);
    }
    return parts.join('\n');
  }
}
