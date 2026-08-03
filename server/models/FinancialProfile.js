import mongoose from 'mongoose';

const financialProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  income: { type: Number, required: true, min: 0 },
  age: { type: Number, required: true, min: 18, max: 80 },
  savings: { type: Number, required: true, min: 0 },
  annualIncome: { type: Number, required: true, min: 0 },
  taxSlab: { type: Number, min: 0, max: 1 },
  effectiveTaxRate: { type: Number, min: 0, max: 100 },
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
  existing_debt: { type: Number, default: 0 },
  dependents: { type: Number, default: 0 },
  emergency_fund_months: { type: Number, default: 0 },
  risk_tolerance: { type: String, enum: ['Conservative', 'Moderate', 'Aggressive'], default: 'Moderate' },
  goal_type: { type: String, enum: ['retirement', 'house purchase', 'education', 'wealth-building'], default: 'wealth-building' },
  totalCTC: { type: Number, default: function() { return this.annualIncome || (this.income ? this.income * 12 : 600000); } },
  basicComponent: { type: Number, default: function() { return (this.totalCTC || (this.annualIncome || (this.income ? this.income * 12 : 600000))) * 0.5; } },
  monthlyTakeHome: { type: Number, default: function() { return this.income || 50000; } },
  soldPropertyAmount: { type: Number, default: 0, min: 0, max: 10000000000 },
  hasLumpSum: { type: Boolean, default: false },
  lumpSumAmount: { type: Number, default: 0, min: 0, max: 10000000000 },
  lastGoalCreatedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
}, {
  optimisticConcurrency: true,
  timestamps: false,
});

financialProfileSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('FinancialProfile', financialProfileSchema);
