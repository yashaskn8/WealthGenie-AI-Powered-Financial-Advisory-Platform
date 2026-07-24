import Joi from 'joi';

/**
 * WealthGenie Request Validation Schemas
 * Uses Joi for runtime input validation on Express routes.
 * 
 * =========================================================================
 * 📘 BEGINNER NOTE: WHAT IS INPUT VALIDATION & JOI?
 * =========================================================================
 * 1. Why input validation matters: 
 *    We must never trust data sent by users or browsers. An attacker could send 
 *    negative numbers for income, strings where dates are expected, or huge payloads
 *    to crash our database or server. Validation acts as a shield, ensuring data is
 *    in the correct format, type, and range before our code processes it.
 * 
 * 2. What is Joi?
 *    Joi is a JavaScript schema description language and validator. It lets us write
 *    declarative schemas to describe what a valid request must look like (e.g. "a string,
 *    between 2 and 100 characters, trimmed, and required"). It automatically rejects
 *    invalid requests with status 400 (Bad Request) and cleanses input (e.g. converting
 *    query strings like "1200000" into actual numbers).
 */

// ── Reusable field definitions ─────────────────────────────────────
const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid ID format');

// ── Auth Schemas ───────────────────────────────────────────────────
export const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required()
    .messages({ 'string.min': 'Name must be at least 2 characters' }),
  email: Joi.string().trim().lowercase().email().max(254).required()
    .messages({ 'string.email': 'Please provide a valid email address' }),
  password: Joi.string().min(8).max(128).required()
    .pattern(/[A-Z]/, 'uppercase')
    .pattern(/[a-z]/, 'lowercase')
    .pattern(/[0-9]/, 'digit')
    .pattern(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'special character')
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.name': 'Password must contain at least one {#name}',
    }),
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required()
    .messages({ 'string.email': 'Please provide a valid email address' }),
  password: Joi.string().min(1).required()
    .messages({ 'any.required': 'Password is required' }),
});

// ── Profile Schema ─────────────────────────────────────────────────
export const profileSchema = Joi.object({
  monthly_income: Joi.number().min(1000).max(100000000).required()
    .messages({
      'number.min': 'Monthly income must be at least ₹1,000',
      'number.max': 'Monthly income cannot exceed ₹10,00,00,000',
    }),
  age: Joi.number().integer().min(18).max(80).required()
    .messages({ 'number.min': 'Age must be at least 18', 'number.max': 'Age must be at most 80' }),
  monthly_savings: Joi.number().min(500).max(100000000).required()
    .messages({
      'number.min': 'Monthly savings must be at least ₹500',
      'number.max': 'Monthly savings cannot exceed ₹10,00,00,000',
    }),
  regime: Joi.string().valid('new', 'old').default('new'),
  investment_horizon: Joi.number().integer().min(1).max(40).default(15),
  liquid_savings: Joi.number().min(0).max(1000000000).required()
    .messages({ 'number.min': 'Liquid savings must be a positive number' }),
  existing_debt: Joi.number().min(0).max(100).required()
    .messages({ 'number.min': 'Existing debt EMI burden must be between 0 and 100%' }),
  dependents: Joi.number().integer().min(0).max(15).required()
    .messages({ 'number.min': 'Dependents must be at least 0' }),
  emergency_fund_months: Joi.number().min(0).max(120).required()
    .messages({ 'number.min': 'Emergency fund months must be at least 0' }),
  risk_tolerance: Joi.string().valid('Conservative', 'Moderate', 'Aggressive').required(),
  goal_type: Joi.string().valid('retirement', 'house purchase', 'education', 'wealth-building').required(),
  version: Joi.number().integer().min(0).optional(),
}).custom((value, helpers) => {
  if (value.monthly_savings >= value.monthly_income) {
    return helpers.error('any.custom', { message: 'Monthly savings (₹' + value.monthly_savings.toLocaleString('en-IN') + ') must be less than monthly income (₹' + value.monthly_income.toLocaleString('en-IN') + ')' });
  }
  return value;
});

// ── Recommendation Schema ──────────────────────────────────────────
export const recommendSchema = Joi.object({
  profileId: objectId.required()
    .messages({ 'string.pattern.base': 'Invalid profile ID format' }),
});

// ── Projection Schema ──────────────────────────────────────────────
const VALID_INSTRUMENTS = [
  'FD', 'ELSS', 'Equity_MF', 'ETF', 'Debt_MF',
  'RBI_Bond', 'G-Sec', 'PPF', 'NPS', 'Gold',
  'SGB', 'Liquid_MF', 'Arbitrage_MF', 'Hybrid_MF',
  'Index_MF', 'Midcap_MF', 'Smallcap_MF', 'SCSS', 'SSY',
];

export const projectionSchema = Joi.object({
  profileId: objectId.required(),
  instruments: Joi.array().items(Joi.string().valid(...VALID_INSTRUMENTS)).min(1).max(10).optional(),
  monthly_investment: Joi.number().min(500).max(10000000).optional(),
  years: Joi.array().items(Joi.number().integer().min(1).max(50)).min(1).max(10).optional(),
});

// ── Monte Carlo Schema ─────────────────────────────────────────────
export const monteCarloSchema = Joi.object({
  instrument: Joi.string().valid(...VALID_INSTRUMENTS).required(),
  monthly_investment: Joi.number().min(500).max(10000000).required(),
  years: Joi.number().integer().min(1).max(40).required(),
  target_amount: Joi.number().min(1000).max(10000000000).optional(),
  current_savings: Joi.number().min(0).max(10000000000).optional(),
  profileId: objectId.optional(),
});

// ── Goal Schema ────────────────────────────────────────────────────
export const goalSchema = Joi.object({
  goal_name: Joi.string().trim().min(2).max(100).required(),
  target_amount: Joi.number().min(1000).max(10000000000).required()
    .messages({
      'number.min': 'Target amount must be at least ₹1,000',
      'number.max': 'Target amount cannot exceed ₹1,000 Crores',
    }),
  target_date: Joi.date().iso().required()
    .custom((value, helpers) => {
      // Enforce 6-month minimum horizon for meaningful projections
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      if (value < sixMonthsFromNow) {
        return helpers.error('date.min', { message: 'Target date must be at least 6 months from today' });
      }
      // Enforce 50-year maximum horizon to prevent CPU/OOM Denial of Service
      const fiftyYearsFromNow = new Date();
      fiftyYearsFromNow.setFullYear(fiftyYearsFromNow.getFullYear() + 50);
      if (value > fiftyYearsFromNow) {
        return helpers.error('date.max', { message: 'Target date cannot be more than 50 years in the future' });
      }
      return value;
    })
    .messages({
      'date.min': 'Target date must be at least 6 months from today for meaningful projections',
    }),
  current_savings: Joi.number().min(0).max(10000000000).default(0),
  profileId: objectId.optional(),
  priority: Joi.string().valid('Critical', 'High', 'Medium', 'Low').default('Medium').optional(),
});

// ── Tax Schema ─────────────────────────────────────────────────────
export const goalUpdateSchema = Joi.object({
  target_amount: Joi.number().min(1000).max(10000000000).optional()
    .messages({
      'number.min': 'Target amount must be at least ₹1,000',
      'number.max': 'Target amount cannot exceed ₹1,000 Crores',
    }),
  current_savings: Joi.number().min(0).max(10000000000).optional(),
  priority: Joi.string().valid('Critical', 'High', 'Medium', 'Low').optional(),
});

export const taxCompareSchema = Joi.object({
  income: Joi.number().min(0).max(1000000000).required()
    .messages({ 'number.min': 'Income must be a positive number' }),
  incomeSource: Joi.string().valid('salary', 'pension', 'family_pension', 'business', 'other').default('salary'),
  section80C: Joi.number().min(0).max(150000).optional(),
  nps80CCD1B: Joi.number().min(0).max(50000).optional(),
  nps80CCD2: Joi.number().min(0).max(100000000).optional(),
  basicSalary: Joi.number().min(0).max(1000000000).optional(),
  isGovtEmployee: Joi.boolean().default(false).optional(),
  section80D: Joi.number().min(0).max(100000).optional(),
  section80D_self: Joi.number().min(0).max(50000).optional(),
  section80D_parents: Joi.number().min(0).max(50000).optional(),
  parents_senior: Joi.boolean().default(false).optional(),
  self_senior: Joi.boolean().default(false).optional(),
  hra: Joi.number().min(0).max(100000000).optional(),
  homeLoanInterest: Joi.number().min(0).max(200000).optional(),
  other: Joi.number().min(0).max(100000000).optional(),
  age: Joi.number().integer().min(18).max(120).optional(),
  fiscalYear: Joi.string().pattern(/^FY\d{4}-\d{2}$/).optional(),
});

export const taxComputeSchema = taxCompareSchema.keys({
  regime: Joi.string().valid('new', 'old').default('new'),
});

// ── Rebalance Schema ───────────────────────────────────────────────
export const rebalanceSchema = Joi.object({
  current_allocation: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(1000000000)).max(30).required()
    .messages({ 'any.required': 'Current asset allocation is required' }),
  target_allocation: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(100)).max(30).required()
    .messages({ 'any.required': 'Target asset weights are required' }),
  threshold: Joi.number().min(0).max(50).default(2.0),
  partial_ratio: Joi.number().min(0.1).max(1.0).default(1.0),
  holding_months: Joi.number().min(0).max(600).default(24),
});

export const updateWeightsSchema = Joi.object({
  profileId: objectId.required()
    .messages({ 'string.pattern.base': 'Invalid profile ID format' }),
  weights: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(1.0)).max(30).required()
    .messages({ 'any.required': 'Weights are required' }),
});


// ── Chat Schema ────────────────────────────────────────────────────
export const chatMessageSchema = Joi.object({
  message: Joi.string().trim().min(1).max(1000).required()
    .messages({
      'string.empty': 'Message cannot be empty',
      'string.max': 'Message too long. Maximum 1000 characters.',
    }),
  session_id: Joi.string().max(100).optional(),
});

function _createValidator(schema, property) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message),
      });
    }
    req[property] = value;
    next();
  };
}

/**
 * Express middleware factory for Joi body validation.
 */
export function validate(schema) {
  return _createValidator(schema, 'body');
}

/**
 * Express middleware factory for Joi query validation.
 */
export function validateQuery(schema) {
  return _createValidator(schema, 'query');
}
