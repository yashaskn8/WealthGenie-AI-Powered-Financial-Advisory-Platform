import mongoose from 'mongoose';

const financialProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  monthlyIncome: { type: Number, required: true, min: 0 },
  age: { type: Number, required: true, min: 18, max: 80 },
  savings: { type: Number, required: true, min: 0 },
  annualIncome: { type: Number, required: true, min: 0 },
  /** Marginal tax rate as a decimal (0.0 to 1.0, e.g. 0.30 for 30% slab) */
  taxSlabDecimal: { type: Number, min: 0, max: 1 },
  /** Effective tax rate as a percentage (0.0 to 100.0, e.g. 18.5 for 18.5%) */
  effectiveTaxRatePercent: { type: Number, min: 0, max: 100 },
  taxRegime: { type: String, enum: ['new', 'old'], default: 'new' },
  riskCategory: {
    type: String,
    enum: ['Conservative', 'Conservative-Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive'],
  },
  riskScore: { type: Number, min: 0, max: 100 },
  riskDescription: { type: String },
  recommendedEquityAllocation: { type: Number, min: 0, max: 100 },
  investableAmount: { type: Number, min: 0 },
  investmentHorizon: { type: Number, min: 1, max: 40, default: 15 },
  liquid_savings: { type: Number, default: 0 },
  /** Existing debt EMI burden as a percentage of monthly income (0.0 to 100.0%) */
  existing_debt_emi_ratio_pct: { type: Number, default: 0, min: 0, max: 100 },
  dependents: { type: Number, default: 0 },
  emergency_fund_months: { type: Number, default: 0 },
  risk_tolerance: { type: String, enum: ['Conservative', 'Moderate', 'Aggressive'], default: 'Moderate' },
  goal_type: { type: String, enum: ['retirement', 'house purchase', 'education', 'wealth-building'], default: 'wealth-building' },
  /** Canonical user goals array (WG-021 consolidation) */
  goals: { type: [String], default: [] },
  totalCTC: { type: Number, default: function() { return this.annualIncome || (this.monthlyIncome ? this.monthlyIncome * 12 : 600000); } },
  basicComponent: { type: Number, default: function() { return (this.totalCTC || (this.annualIncome || (this.monthlyIncome ? this.monthlyIncome * 12 : 600000))) * 0.5; } },
  monthlyTakeHome: { type: Number, default: function() { return this.monthlyIncome || 50000; } },
  soldPropertyAmount: { type: Number, default: 0, min: 0, max: 10000000000 },
  hasLumpSum: { type: Boolean, default: false },
  lumpSumAmount: { type: Number, default: 0, min: 0, max: 10000000000 },
  /** One-time investable capital derived from available lump sum (WG-013) */
  oneTimeInvestableAmount: { type: Number, default: 0, min: 0 },
  /** Tax deduction fields (WG-DEDUCTIONS-COLLECTION) */
  section80C: { type: Number, default: 0, min: 0, max: 150000 },
  section80CCD1B: { type: Number, default: 0, min: 0, max: 50000 },
  section80D_self: { type: Number, default: 0, min: 0, max: 50000 },
  section80D_parents: { type: Number, default: 0, min: 0, max: 50000 },
  parentsSenior: { type: Boolean, default: false },
  hra: { type: Number, default: 0, min: 0, max: 10000000 },
  homeLoanInterest: { type: Number, default: 0, min: 0, max: 200000 },
  section80EEA: { type: Number, default: 0, min: 0, max: 150000 },
  incomeSource: { type: String, enum: ['salary', 'pension', 'family_pension', 'other'], default: 'salary' },
  lastGoalCreatedAt: { type: Date },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
}, {
  optimisticConcurrency: true,
  timestamps: false,
  toObject: { getters: true, virtuals: true },
  toJSON: { getters: true, virtuals: true },
});

financialProfileSchema.virtual('income')
  .get(function() { return this.monthlyIncome; })
  .set(function(v) { this.monthlyIncome = v; });

// Backwards-compatible virtual getters/setters for renamed tax fields (WG-023)
financialProfileSchema.virtual('taxSlab')
  .get(function() { return this.taxSlabDecimal; })
  .set(function(v) { this.taxSlabDecimal = v; });

financialProfileSchema.virtual('effectiveTaxRate')
  .get(function() { return this.effectiveTaxRatePercent; })
  .set(function(v) { this.effectiveTaxRatePercent = v; });

// Backwards-compatible virtual getter/setter for renamed debt field (WG-029)
financialProfileSchema.virtual('existing_debt')
  .get(function() { return this.existing_debt_emi_ratio_pct; })
  .set(function(v) { this.existing_debt_emi_ratio_pct = v; });

// Virtual getter/setter for one-time investable capital (WG-013)
financialProfileSchema.virtual('investable_amount_onetime')
  .get(function() { return this.oneTimeInvestableAmount; })
  .set(function(v) { this.oneTimeInvestableAmount = v; });

// Backwards-compatible virtual getters/setters for deduction fields (WG-DEDUCTIONS-COLLECTION)
financialProfileSchema.virtual('section_80c')
  .get(function() { return this.section80C; })
  .set(function(v) { this.section80C = v; });

financialProfileSchema.virtual('section_80ccd1b')
  .get(function() { return this.section80CCD1B; })
  .set(function(v) { this.section80CCD1B = v; });

financialProfileSchema.virtual('nps80CCD1B')
  .get(function() { return this.section80CCD1B; })
  .set(function(v) { this.section80CCD1B = v; });

financialProfileSchema.virtual('section80CCD')
  .get(function() { return this.section80CCD1B; })
  .set(function(v) { this.section80CCD1B = v; });

financialProfileSchema.virtual('section_80d_self')
  .get(function() { return this.section80D_self; })
  .set(function(v) { this.section80D_self = v; });

financialProfileSchema.virtual('section_80d_parents')
  .get(function() { return this.section80D_parents; })
  .set(function(v) { this.section80D_parents = v; });

financialProfileSchema.virtual('parents_senior')
  .get(function() { return this.parentsSenior; })
  .set(function(v) { this.parentsSenior = v; });

financialProfileSchema.virtual('home_loan_interest')
  .get(function() { return this.homeLoanInterest; })
  .set(function(v) { this.homeLoanInterest = v; });

financialProfileSchema.virtual('section_80eea')
  .get(function() { return this.section80EEA; })
  .set(function(v) { this.section80EEA = v; });

financialProfileSchema.virtual('income_source')
  .get(function() { return this.incomeSource; })
  .set(function(v) { this.incomeSource = v; });

financialProfileSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('FinancialProfile', financialProfileSchema);
