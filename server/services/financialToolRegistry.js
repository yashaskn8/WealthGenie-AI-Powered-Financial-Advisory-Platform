import Joi from 'joi';
import { sipFV, lumpSumFV } from './projectionEngine.js';
import { reverseSIP } from './monteCarloEngine.js';
import { computeTax } from './taxEngine.js';
import { computeXIRR } from './xirrCalculator.js';
import { solveMinVariance, solveMaxSharpe, solveRiskParity, computeRebalance } from './portfolioEngine.js';
import { PrometheusMetrics } from './metricsCollector.js';

/**
 * WealthGenie Centralized Financial Tool Registry
 * Exposes canonical financial engines as executable AI tools.
 * Single source of truth for all deterministic calculations requested by LLMs.
 */
const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf']);

const VALID_ASSET_KEYS = [
  'Equity_MF', 'ELSS', 'ETF', 'Debt_MF', 'FD', 'Gold', 'NPS', 'PPF',
  'RBI_Bond', 'G-Sec', 'SGB', 'Liquid_MF', 'Arbitrage_MF', 'Hybrid_MF',
  'Index_MF', 'Midcap_MF', 'Smallcap_MF',
];

const SAFE_ALLOCATION_KEY_REGEX = /^(?!__proto__|constructor|prototype|toString|valueOf)[a-zA-Z0-9_-]{1,50}$/;

/**
 * Recursively strips dangerous object keys to prevent prototype pollution.
 */
function sanitizeToolInputs(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeToolInputs);

  const clean = Object.create(null);
  for (const [key, val] of Object.entries(obj)) {
    if (DANGEROUS_OBJECT_KEYS.has(key) || key.startsWith('__')) {
      continue;
    }
    clean[key] = sanitizeToolInputs(val);
  }
  return clean;
}

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerCoreTools();
  }

  /**
   * Registers a new financial calculation tool.
   *
   * @param {string} name
   * @param {object} config - { description, schema, executor, version }
   */
  registerTool(name, config) {
    if (!name || !config.schema || !config.executor) {
      throw new Error(`Invalid tool registration for '${name}'. Schema and executor are required.`);
    }
    this.tools.set(name, {
      name,
      description: config.description || '',
      schema: config.schema,
      executor: config.executor,
      version: config.version || '1.0.0',
    });
  }

  /**
   * Retrieves a tool definition by name.
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  hasTool(name) {
    return this.tools.has(name);
  }

  /**
   * Returns metadata for all registered tools.
   */
  listTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      version: t.version,
    }));
  }

  /**
   * Executes a requested tool against canonical backend engine.
   *
   * @param {string} name
   * @param {object} args
   * @param {object} [context={}]
   * @returns {Promise<{ success: boolean, result: any, error?: string, execution_time_ms: number }>}
   */
  async executeTool(name, args = {}, context = {}) {
    const startTime = Date.now();
    const tool = this.getTool(name);

    if (!tool) {
      PrometheusMetrics.recordToolExecution(name, false);
      return {
        success: false,
        error: `Unknown tool requested: '${name}'`,
        result: null,
        execution_time_ms: Date.now() - startTime,
      };
    }

    // Step 1: Deep input sanitization to strip prototype pollution keys & hidden injected fields
    const sanitizedArgs = sanitizeToolInputs(args);

    // Step 2: Validate inputs against tool Joi schema
    const { error, value } = tool.schema.validate(sanitizedArgs, { stripUnknown: true });
    if (error) {
      PrometheusMetrics.recordToolExecution(name, false);
      return {
        success: false,
        error: `Invalid tool arguments for '${name}': ${error.details.map(d => d.message).join(', ')}`,
        result: null,
        execution_time_ms: Date.now() - startTime,
      };
    }

    try {
      const result = await tool.executor(value, context);
      PrometheusMetrics.recordToolExecution(name, true);
      return {
        success: true,
        result,
        execution_time_ms: Date.now() - startTime,
      };
    } catch (execErr) {
      console.error(`[ToolRegistry] Error executing tool '${name}':`, execErr.message);
      PrometheusMetrics.recordToolExecution(name, false);
      return {
        success: false,
        error: `Execution error in '${name}': ${execErr.message}`,
        result: null,
        execution_time_ms: Date.now() - startTime,
      };
    }
  }

  registerCoreTools() {
    // 1. SIP Projection Tool
    this.registerTool('sip_projection', {
      description: 'Calculates Future Value of a Systematic Investment Plan (SIP) using monthly annuity-due compounding.',
      version: '2.1.0',
      schema: Joi.object({
        monthlyInvestment: Joi.number().min(100).max(10000000).required(),
        annualRate: Joi.number().min(0.001).max(0.50).required(), // decimal, e.g. 0.12 for 12%
        years: Joi.number().min(1).max(50).required(),
      }),
      executor: async ({ monthlyInvestment, annualRate, years }) => {
        const futureValue = sipFV(monthlyInvestment, annualRate, years);
        const totalInvested = monthlyInvestment * years * 12;
        const totalReturns = Math.max(0, futureValue - totalInvested);
        return {
          monthlyInvestment,
          annualRatePct: annualRate * 100,
          years,
          totalInvested: Math.round(totalInvested),
          futureValue: Math.round(futureValue),
          totalReturns: Math.round(totalReturns),
        };
      },
    });

    // 2. Lump Sum Projection Tool
    this.registerTool('lump_sum_projection', {
      description: 'Calculates Future Value of a one-time lump sum investment using compound interest.',
      version: '2.1.0',
      schema: Joi.object({
        principal: Joi.number().min(1000).max(1000000000).required(),
        annualRate: Joi.number().min(0.001).max(0.50).required(),
        years: Joi.number().min(1).max(50).required(),
      }),
      executor: async ({ principal, annualRate, years }) => {
        const futureValue = lumpSumFV(principal, annualRate, years);
        const totalReturns = Math.max(0, futureValue - principal);
        return {
          principal,
          annualRatePct: annualRate * 100,
          years,
          futureValue: Math.round(futureValue),
          totalReturns: Math.round(totalReturns),
        };
      },
    });

    // 3. Reverse SIP Planner Tool
    this.registerTool('reverse_sip', {
      description: 'Calculates required monthly SIP to achieve a target financial goal.',
      version: '2.1.0',
      schema: Joi.object({
        targetAmount: Joi.number().min(1000).max(10000000000).required(),
        annualRate: Joi.number().min(0.001).max(0.50).required(),
        years: Joi.number().min(1).max(50).required(),
        currentSavings: Joi.number().min(0).max(10000000000).default(0),
      }),
      executor: async ({ targetAmount, annualRate, years, currentSavings }) => {
        const requiredMonthlySip = reverseSIP(targetAmount, annualRate, years, currentSavings);
        return {
          targetAmount,
          annualRatePct: annualRate * 100,
          years,
          currentSavings,
          requiredMonthlySip: Math.round(requiredMonthlySip),
        };
      },
    });

    // 4. Tax Calculator Tool
    this.registerTool('tax_calculator', {
      description: 'Computes income tax liability under current Indian tax slabs (FY 2025-26).',
      version: '2.1.0',
      schema: Joi.object({
        income: Joi.number().min(0).max(1000000000).required(),
        basicSalary: Joi.number().min(0).max(1000000000).optional(),
        regime: Joi.string().valid('new', 'old').default('new'),
        section80C: Joi.number().min(0).max(150000).default(0),
        nps80CCD1B: Joi.number().min(0).max(50000).default(0),
        section80D: Joi.number().min(0).max(100000).default(0),
        hra: Joi.number().min(0).max(100000000).default(0),
      }),
      executor: async ({ income, basicSalary, regime, section80C, nps80CCD1B, section80D, hra }) => {
        const deductions = { basicSalary, section80C, nps80CCD1B, section80D, hra };
        const taxResult = computeTax(income, regime, deductions);
        return taxResult;
      },
    });

    // 5. XIRR Calculator Tool
    this.registerTool('xirr_calculator', {
      description: 'Calculates Exact Internal Rate of Return (XIRR) for irregular cash flows.',
      version: '2.1.0',
      schema: Joi.object({
        cashflows: Joi.array().items(
          Joi.object({
            amount: Joi.number().required(),
            date: Joi.string().required(),
          })
        ).min(2).required(),
      }),
      executor: async ({ cashflows }) => {
        return computeXIRR(cashflows);
      },
    });

    // 6. Portfolio Optimizer Tool
    this.registerTool('portfolio_optimizer', {
      description: 'Optimizes asset weights for minimum variance, maximum Sharpe ratio, or risk parity.',
      version: '2.1.0',
      schema: Joi.object({
        strategy: Joi.string().valid('min_variance', 'max_sharpe', 'risk_parity').default('min_variance'),
        assets: Joi.array().items(Joi.string().valid(...VALID_ASSET_KEYS)).min(2).max(10).default(['Equity_MF', 'Debt_MF', 'Gold']),
      }),
      executor: async ({ strategy, assets }) => {
        const defaultReturns = { Equity_MF: 0.12, Debt_MF: 0.07, Gold: 0.08, ELSS: 0.12, FD: 0.065 };
        const postTaxReturns = assets.map(a => defaultReturns[a] || 0.08);

        let result;
        if (strategy === 'max_sharpe') {
          result = solveMaxSharpe(assets, postTaxReturns);
        } else if (strategy === 'risk_parity') {
          result = solveRiskParity(assets, postTaxReturns);
        } else {
          result = solveMinVariance(assets, postTaxReturns);
        }
        return { strategy, ...result };
      },
    });

    // 7. Portfolio Rebalance Tool
    this.registerTool('rebalance_calculator', {
      description: 'Computes portfolio drift and rebalance buy/sell directives.',
      version: '2.1.0',
      schema: Joi.object({
        current_allocation: Joi.object().pattern(SAFE_ALLOCATION_KEY_REGEX, Joi.number().min(0)).required(),
        target_allocation: Joi.object().pattern(SAFE_ALLOCATION_KEY_REGEX, Joi.number().min(0).max(100)).required(),
        threshold: Joi.number().min(0).max(50).default(2.0),
      }),
      executor: async ({ current_allocation, target_allocation, threshold }) => {
        return computeRebalance(current_allocation, target_allocation, threshold);
      },
    });
  }
}

export const FinancialToolRegistry = new ToolRegistry();
