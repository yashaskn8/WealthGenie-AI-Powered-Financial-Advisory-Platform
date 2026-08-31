import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Goal from '../models/Goal.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { persistGoalAtomically } from '../routes/goals.js';
import { setupTestDatabase, teardownTestDatabase } from './helpers/mongoTestHelper.js';

const userId = new mongoose.Types.ObjectId();
const profileId = new mongoose.Types.ObjectId();

function goalData(name) {
  return {
    userId,
    profileId,
    goal_name: name,
    target_amount: 1000000,
    inflation_adjusted_target: 1200000,
    target_date: new Date('2032-01-01T00:00:00.000Z'),
    current_savings: 50000,
    recommended_sip: 15000,
    recommended_instrument: 'Equity_MF',
    probability_of_success: 0.72,
    gap_amount: 0,
    status: 'on_track',
    priority: 'High',
  };
}

async function resetProfile() {
  await Promise.all([
    Goal.deleteMany({ userId }),
    FinancialProfile.deleteMany({ userId }),
  ]);
  await FinancialProfile.create({
    _id: profileId,
    userId,
    age: 30,
    annualIncome: 960000,
    savings: 20000,
    income: 80000,
    taxRegime: 'new',
    riskCategory: 'Moderate',
    investmentHorizon: 15,
    goals: [],
  });
}

test.before(async () => {
  await setupTestDatabase({ requireReplicaSet: true });
  await Promise.all([Goal.init(), FinancialProfile.init()]);
});

test.beforeEach(resetProfile);

test.after(async () => {
  await Promise.all([Goal.deleteMany({ userId }), FinancialProfile.deleteMany({ userId })]).catch(() => {});
  await teardownTestDatabase();
});

test('successful goal transaction updates Goal and FinancialProfile together', async () => {
  const goal = await persistGoalAtomically(goalData('Emergency Fund'), profileId);
  const [storedGoal, profile] = await Promise.all([
    Goal.findById(goal._id).lean(),
    FinancialProfile.findById(profileId).lean(),
  ]);

  assert.ok(storedGoal);
  assert.ok(profile.goals.includes('Emergency Fund'));
  assert.ok(profile.lastGoalCreatedAt);
});

test('forced failure after Goal insert rolls back Goal and profile changes', async () => {
  await assert.rejects(
    persistGoalAtomically(goalData('Rollback Goal'), profileId, {
      testHooks: { afterGoalCreate: () => { throw new Error('injected goal transaction failure'); } },
    }),
    /injected goal transaction failure/,
  );

  const [goalCount, profile] = await Promise.all([
    Goal.countDocuments({ userId }),
    FinancialProfile.findById(profileId).lean(),
  ]);
  assert.equal(goalCount, 0);
  assert.deepEqual(profile.goals || [], []);
});

test('concurrent goal creation preserves every Goal and profile goal name', async () => {
  const names = Array.from({ length: 8 }, (_, index) => `Concurrent Goal ${index + 1}`);
  await Promise.all(names.map(name => persistGoalAtomically(goalData(name), profileId)));

  const [goals, profile] = await Promise.all([
    Goal.find({ userId }).lean(),
    FinancialProfile.findById(profileId).lean(),
  ]);
  assert.equal(goals.length, names.length);
  assert.deepEqual([...profile.goals].sort(), [...names].sort());
});

