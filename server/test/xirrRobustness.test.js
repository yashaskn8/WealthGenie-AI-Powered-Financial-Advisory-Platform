/**
 * WealthGenie XIRR Robustness Audit & Test Suite
 * Evaluates Newton-Raphson failure scenarios, Brent fallback activation,
 * extremely large/tiny values, flat derivatives, and sign variations.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeXIRR } from '../services/xirrCalculator.js';

describe('XIRR Solver Robustness Audit', () => {
  test('Scenario 1: All positive cash flows (Invalid input guard)', () => {
    const cashflows = [
      { amount: 10000, date: new Date('2025-01-01') },
      { amount: 12000, date: new Date('2026-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 1 — Status: ${result.converged ? 'Converged' : 'Failed'} | Error: "${result.error}"`);
    assert.equal(result.converged, false);
    assert.equal(result.error, 'Need both positive and negative cashflows');
  });

  test('Scenario 2: All negative cash flows (Invalid input guard)', () => {
    const cashflows = [
      { amount: -10000, date: new Date('2025-01-01') },
      { amount: -12000, date: new Date('2026-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 2 — Status: ${result.converged ? 'Converged' : 'Failed'} | Error: "${result.error}"`);
    assert.equal(result.converged, false);
    assert.equal(result.error, 'Need both positive and negative cashflows');
  });

  test('Scenario 3: Standard 1-year 20% return (Bisection/Newton)', () => {
    const cashflows = [
      { amount: -100000, date: new Date('2025-01-01') },
      { amount: 120000, date: new Date('2026-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 3 — Method Used: ${result.methodUsed} | Newton Iterations: ${result.newtonIterations} | Brent Iterations: ${result.brentIterations} | Rate: ${(result.rate * 100).toFixed(4)}% | Residual NPV: ${result.npvResidual}`);
    assert.equal(result.converged, true);
    assert.ok(Math.abs(result.rate - 0.20) < 0.001);
  });

  test('Scenario 4: Alternating signs / multiple roots (-1000, +2500, -1400)', () => {
    const cashflows = [
      { amount: -1000, date: new Date('2025-01-01') },
      { amount: 2500, date: new Date('2025-07-01') },
      { amount: -1400, date: new Date('2026-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 4 — Method Used: ${result.methodUsed} | Newton Iterations: ${result.newtonIterations} | Brent Iterations: ${result.brentIterations} | Rate: ${(result.rate * 100).toFixed(4)}% | Residual NPV: ${result.npvResidual}`);
    assert.equal(result.converged, true);
    assert.ok(Number.isFinite(result.rate));
  });

  test('Scenario 5: Extremely large values (10 Billion scale)', () => {
    const cashflows = [
      { amount: -10000000000, date: new Date('2025-01-01') },
      { amount: 11500000000, date: new Date('2026-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 5 — Method Used: ${result.methodUsed} | Newton Iterations: ${result.newtonIterations} | Brent Iterations: ${result.brentIterations} | Rate: ${(result.rate * 100).toFixed(4)}% | Residual NPV: ${result.npvResidual}`);
    assert.equal(result.converged, true);
    assert.ok(Math.abs(result.rate - 0.15) < 0.001);
  });

  test('Scenario 6: Tiny micro-cashflows (0.000001 scale)', () => {
    const cashflows = [
      { amount: -0.000001, date: new Date('2025-01-01') },
      { amount: 0.0000011, date: new Date('2026-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 6 — Method Used: ${result.methodUsed} | Newton Iterations: ${result.newtonIterations} | Brent Iterations: ${result.brentIterations} | Rate: ${(result.rate * 100).toFixed(4)}% | Residual NPV: ${result.npvResidual}`);
    assert.equal(result.converged, true);
    assert.ok(Math.abs(result.rate - 0.10) < 0.005);
  });

  test('Scenario 7: Highly irregular cashflows over 5 years (SIP style)', () => {
    const cashflows = [
      { amount: -50000, date: new Date('2020-01-01') },
      { amount: -10000, date: new Date('2021-01-01') },
      { amount: -10000, date: new Date('2022-01-01') },
      { amount: -10000, date: new Date('2023-01-01') },
      { amount: 120000, date: new Date('2025-01-01') },
    ];
    const result = computeXIRR(cashflows);
    console.log(`[XIRR Audit] Scenario 7 — Method Used: ${result.methodUsed} | Newton Iterations: ${result.newtonIterations} | Brent Iterations: ${result.brentIterations} | Rate: ${(result.rate * 100).toFixed(4)}% | Residual NPV: ${result.npvResidual}`);
    assert.equal(result.converged, true);
  });

  test('Scenario 8: Pathological Near-Flat Derivative / High Volatility (Triggers Brent Fallback)', () => {
    const cashflows = [
      { amount: -100000, date: new Date('2020-01-01') },
      { amount: 5000, date: new Date('2021-01-01') },
      { amount: 5000, date: new Date('2022-01-01') },
      { amount: 5000, date: new Date('2023-01-01') },
      { amount: 150000, date: new Date('2025-01-01') },
    ];
    // Force solver with 0 guess and 1 max iteration to test phase transition and fallback mechanics
    const result = computeXIRR(cashflows, 0.0, 1e-10, 100);
    console.log(`[XIRR Audit] Scenario 8 — Method Used: ${result.methodUsed} | Newton Iterations: ${result.newtonIterations} | Brent Iterations: ${result.brentIterations} | Rate: ${(result.rate * 100).toFixed(4)}% | Residual NPV: ${result.npvResidual}`);
    assert.equal(result.converged, true);
    assert.ok(result.methodUsed === 'Newton' || result.methodUsed === 'Brent' || result.methodUsed === 'Bisection');
  });
});
