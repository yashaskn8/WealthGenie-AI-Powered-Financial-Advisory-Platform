import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import FinancialProfile from '../models/FinancialProfile.js';
import Recommendation from '../models/Recommendation.js';
import Goal from '../models/Goal.js';
import Instrument from '../models/Instrument.js';
import { investmentDatabase } from '../data/investmentDatabase.js';

const LOADTEST_USER_ID = '60d5ecb8b3b3a72d9c8e4a11';

function mapToDocument(inv) {
  const LEGACY_TYPE_MAP = {
    'Government': 'Government',
    'Gold': 'Gold',
    'Retirement': 'Government',
    'Bank Deposits': 'FD',
    'Debt Mutual Funds': 'Mutual_Fund',
    'Equity Mutual Funds': 'Mutual_Fund',
    'ETFs': 'ETF',
    'REITs & InvITs': 'ETF',
    'Bonds & Debentures': 'Government',
    'Insurance-linked': 'Mutual_Fund',
    'Direct Equity': 'ETF',
    'Other': 'Mutual_Fund',
  };

  const legacyType = inv.taxType === 'elss' ? 'ELSS' : (LEGACY_TYPE_MAP[inv.category] || 'Mutual_Fund');

  return {
    id: inv.id,
    name: inv.name,
    type: legacyType,
    interestRate: inv.expectedReturn,
    minTenureMonths: inv.lockInYears ? inv.lockInYears * 12 : 0,
    maxTenureMonths: inv.lockInYears ? inv.lockInYears * 12 : 360,
    riskLevel: String(inv.riskLabel || inv.riskLevel || 'moderate').toLowerCase(),
    taxExempt: inv.taxType === 'exempt' || inv.taxType === 'elss',
    description: inv.description,
    category: inv.category,
    expectedReturn: inv.expectedReturn,
    volatility: inv.volatility,
    riskScore: inv.riskScore,
    minInvestment: inv.minInvestment,
    maxInvestment: inv.maxInvestment,
    liquidity: inv.liquidity,
    lockInYears: inv.lockInYears,
    taxType: inv.taxType,
    returns1yr: inv.historicalReturns?.yr1,
    returns3yr: inv.historicalReturns?.yr3,
    returns5yr: inv.historicalReturns?.yr5,
    aumCr: inv.aumCr,
    expenseRatio: inv.expenseRatio,
    fundManager: inv.fundManager,
    benchmarkIndex: inv.benchmarkIndex,
    lastUpdated: new Date(),
  };
}

async function seedLoadTestData() {
  await connectDB();
  console.log('Seeding loadtest data in MongoDB...');

  // 1. Seed Instruments
  await Instrument.deleteMany({});
  const docs = investmentDatabase.map(mapToDocument);
  await Instrument.insertMany(docs);
  console.log(`✓ Seeded ${docs.length} instruments`);

  // 2. Seed User
  await User.deleteOne({ _id: LOADTEST_USER_ID });
  await User.create({
    _id: LOADTEST_USER_ID,
    name: 'LoadTest User',
    email: 'loadtest@wealthgenie.ai',
    passwordHash: '$2a$10$e7K4V5m.y1sA2.g8L2k3u.uY5kQ6r7s8t9u0v1w2x3y4z5a6b7c8d',
  });
  console.log('✓ Seeded loadtest User');

  // 3. Seed FinancialProfile
  await FinancialProfile.deleteMany({ userId: LOADTEST_USER_ID });
  const profile = await FinancialProfile.create({
    userId: LOADTEST_USER_ID,
    age: 32,
    income: 1500000,
    savings: 45000,
    annualIncome: 1500000,
    monthlySavings: 45000,
    liquidSavings: 500000,
    existingDebt: 200000,
    dependents: 1,
    emergencyFundMonths: 6,
    statedToleranceScore: 7,
    taxRegime: 'new',
    investmentHorizon: 15,
    riskScore: 65,
    riskCategory: 'Moderate',
  });
  console.log('✓ Seeded FinancialProfile');

  // 4. Seed Recommendation
  await Recommendation.deleteMany({ userId: LOADTEST_USER_ID });
  await Recommendation.create({
    userId: LOADTEST_USER_ID,
    profileId: profile._id,
    recommendedStrategy: 'Moderate Wealth Creation',
    primaryInstrument: 'Equity_MF',
    allocations: [
      { instrument: 'Nifty 50 Index Fund', percentage: 40, category: 'Equity Mutual Funds' },
      { instrument: 'Flexi Cap Fund', percentage: 30, category: 'Equity Mutual Funds' },
      { instrument: 'Short Duration Debt Fund', percentage: 20, category: 'Debt Mutual Funds' },
      { instrument: 'Sovereign Gold Bond', percentage: 10, category: 'Government' },
    ],
    generatedAt: new Date(),
  });
  console.log('✓ Seeded Recommendation');

  // 5. Seed Goals
  await Goal.deleteMany({ userId: LOADTEST_USER_ID });
  await Goal.create({
    userId: LOADTEST_USER_ID,
    goal_name: 'Retirement Corpus',
    target_amount: 20000000,
    target_date: new Date('2046-08-01'),
    current_savings: 500000,
    recommended_sip: 30000,
    priority: 'High',
  });
  console.log('✓ Seeded Goal');

  console.log('Loadtest data seeding complete.');
  await mongoose.connection.close();
}

seedLoadTestData().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
