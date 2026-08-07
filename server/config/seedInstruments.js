/**
 * WealthGenie — Instrument Seed Script
 * ─────────────────────────────────────
 * Seeds MongoDB with ALL instruments from the backend's authoritative
 * investment catalog (server/data/investmentDatabase.js).
 *
 * Usage:  npm run seed
 *   or:   node --experimental-specifier-resolution=node server/config/seedInstruments.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Instrument from '../models/Instrument.js';
import { investmentDatabase } from '../data/investmentDatabase.js';

/**
 * Map a catalog instrument to a Mongoose-compatible document.
 * Preserves all metadata fields and adds backward-compatible mappings
 * for legacy queries that rely on `type` being one of the 5 original values.
 */
import { LEGACY_TYPE_MAP } from './instrumentMapping.js';

function mapToDocument(inv) {
  // Detect ELSS specifically from taxType
  const legacyType = inv.taxType === 'elss'
    ? 'ELSS'
    : (LEGACY_TYPE_MAP[inv.category] || LEGACY_TYPE_MAP[inv.cat] || 'Mutual_Fund');

  return {
    id: inv.id,
    name: inv.name,
    abbr: inv.abbr,
    type: legacyType,
    category: inv.category || inv.cat,
    cat: inv.cat || inv.category,
    subCategory: inv.subCategory,
    assetClass: inv.assetClass,
    provider: inv.provider,

    // Return & Risk
    expectedReturn: inv.expectedReturn || inv.rate,
    rate: inv.rate || inv.expectedReturn,
    returnRange: inv.returnRange,
    interestRate: inv.interestRate || inv.expectedReturn || inv.rate,
    risk: inv.dynamicData?.risk?.value ?? inv.riskLevel ?? 3,
    riskLabel: inv.riskLabel,
    volatility: inv.volatility,

    // Liquidity
    liquidityScore: inv.liquidityScore,
    lockIn: inv.lockIn || 0,
    lockInYears: inv.lockIn || 0,

    // Tax & Cost
    taxType: inv.taxType,
    taxEfficiencyScore: inv.taxEfficiencyScore,
    taxation: inv.taxation,
    expenseRatio: inv.expenseRatio || 0,

    // Investment Limits
    minMonthlyInvestment: inv.minMonthlyInvestment,
    maxAnnualInvestment: inv.maxAnnualInvestment,
    minInvestment: inv.minMonthlyInvestment || inv.minInvestment,

    // Horizon & Goals
    idealHorizon: inv.idealHorizon,
    goalTags: inv.goalTags || [],

    // Eligibility
    eligibility: inv.eligibility,

    // Display
    color: inv.color,
    desc: inv.desc,

    // Sovereign guarantee (infer from asset class)
    sovereignGuarantee: inv.assetClass === 'Sovereign',
  };
}

async function seed() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('MONGODB_URI not set. Please configure your .env file.');
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✓ Connected to MongoDB');

    // Clear existing instruments
    const deleted = await Instrument.deleteMany({});
    console.log(`✓ Cleared ${deleted.deletedCount} existing instruments`);

    // Map and insert all catalog instruments
    const documents = investmentDatabase.map(mapToDocument);
    const result = await Instrument.insertMany(documents, { ordered: false });
    console.log(`✓ Seeded ${result.length} instruments successfully`);

    // Summary by type
    const typeCounts = {};
    documents.forEach(d => {
      typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
    });
    console.log('  Distribution:', JSON.stringify(typeCounts, null, 2));

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    if (err.writeErrors) {
      console.error(`  ${err.writeErrors.length} write errors. First:`, err.writeErrors[0]?.errmsg);
    }
    process.exit(1);
  }
}

seed();
