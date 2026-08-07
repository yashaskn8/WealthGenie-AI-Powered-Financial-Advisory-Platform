import mongoose from 'mongoose';

const instrumentDetailSchema = new mongoose.Schema({
  name: String,
  type: String,
  nominalReturn: Number,
  postTaxReturn: Number,
  effectiveYield: Number,
  expenseRatio: Number,
  riskLevel: String,
  lockIn: Number,
  tags: [String],
  taxNotes: String,
  sharpeRatio: Number,
  allocationWeight: Number,
}, { _id: false });

const recommendationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialProfile', required: true },
  instruments: [instrumentDetailSchema],
  advisoryText: { type: String },
  confidenceScores: {
    type: Map,
    of: { type: Number, min: 0, max: 1 },
    default: {},
  },
  mlFallback: { type: Boolean, default: false },
  modelVersion: { type: String, default: '1.0' },
  generatedAt: { type: Date, default: Date.now },
});

recommendationSchema.index({ userId: 1, generatedAt: -1 });
recommendationSchema.index({ profileId: 1 });

export default mongoose.model('Recommendation', recommendationSchema);
