import Joi from 'joi';
import { sipFV, lumpSumFV } from './projectionEngine.js';
import { reverseSIP } from './monteCarloEngine.js';
import { computeTax } from './taxEngine.js';
import { computeXIRR } from './xirrCalculator.js';
import { solveMinVariance, solveMaxSharpe, solveRiskParity, computeRebalance } from './portfolioEngine.js';

/**
 * WealthGenie Centralized Financial Tool Registry
 * Exposes canonical financial engines as executable AI tools.
 * Single source of truth for all deterministic calculations requested by LLMs.
 */
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerCoreTools();
  }

  registerTool(name, toolDefinition) {
    if (!name || !toolDefinition || typeof toolDefinition.executor !== 'function') {
      throw new Error(`Invalid tool registration for '${name}'`);
    }
    this.tools.set(name, {
      name,
      description: toolDefinition.description || '',
      version: toolDefinition.version || '1.0.0',
      schema: toolDefinition.schema || Joi.object().unknown(false),
      executor: toolDefinition.executor,
    });
  }

  getTool(name) {
    return this.tools.get(name) || null;
  }

  hasTool(name) {
    return this.tools.has(name);
  }

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
      return {
        success: false,
        error: `Unknown tool requested: '${name}'`,
        result: null,
        execution_time_ms: Date.now() - startTime,
      };
    }

    // Validate inputs against tool Joi schema
    const { error, value } = tool.schema.validate(args, { stripUnknown: true });
    if (error) {
      return {
        success: false,
        error: `Invalid tool arguments for '${name}': ${error.details.map(d => d.message).join(', ')}`,
        result: null,
        execution_time_ms: Date.now() - startTime,
      };
    }

    try {
      const result = await tool.executor(value, context);
      return {
        success: true,
        result,
        execution_time_ms: Date.now() - startTime,
      };
    } catch (execErr) {
      console.error(`[ToolRegistry] Error executing tool '${name}':`, execErr.message);
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
      version: '2.0.0',
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
      version: '2.0.0',
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
      version: '2.0.0',
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
      version: '2.0.0',
      schema: Joi.object({
        income: Joi.number().min(0).max(1000000000).required(),
        regime: Joi.string().valid('new', 'old').default('new'),
        section80C: Joi.number().min(0).max(150000).default(0),
        nps80CCD1B: Joi.number().min(0).max(50000).default(0),
        section80D: Joi.number().min(0).max(100000).default(0),
        hra: Joi.number().min(0).max(100000000).default(0),
      }),
      executor: async ({ income, regime, section80C, nps80CCD1B, section80D, hra }) => {
        const taxResult = computeTax({
          income,
          regime,
          section80C,
          nps80CCD1B,
          section80D,
          hra,
        });
        return taxResult;
      },
    });

    // 5. XIRR Calculator Tool
    this.registerTool('xirr_calculator', {
      description: 'Calculates Exact Internal Rate of Return (XIRR) for irregular cash flows.',
      version: '2.0.0',
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
      version: '2.0.0',
      schema: Joi.object({
        strategy: Joi.string().valid('min_variance', 'max_sharpe', 'risk_parity').default('min_variance'),
        assets: Joi.array().items(Joi.string()).min(2).max(10).default(['Equity_MF', 'Debt_MF', 'Gold']),
      }),
      executor: async ({ strategy, assets }) => {
        let result;
        if (strategy === 'max_sharpe') {
          result = solveMaxSharpe(assets);
        } else if (strategy === 'risk_parity') {
          result = solveRiskParity(assets);
        } else {
          result = solveMinVariance(assets);
        }
        return { strategy, ...result };
      },
    });

    // 7. Portfolio Rebalance Tool
    this.registerTool('rebalance_calculator', {
      description: 'Computes portfolio drift and rebalance buy/sell directives.',
      version: '2.0.0',
      schema: Joi.object({
        current_allocation: Joi.object().pattern(Joi.string(), Joi.number().min(0)).required(),
        target_allocation: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(100)).required(),
        threshold: Joi.number().min(0).max(50).default(2.0),
      }),
      executor: async ({ current_allocation, target_allocation, threshold }) => {
        return computeRebalance(current_allocation, target_allocation, threshold);
      },
    });
  }
}

export const FinancialToolRegistry = new ToolRegistry();
