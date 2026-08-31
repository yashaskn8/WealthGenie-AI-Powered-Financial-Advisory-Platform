import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('frontend API contracts', () => {
  beforeEach(() => {
    api.clearAuthToken();
    vi.restoreAllMocks();
  });

  it('sends the mobile number collected by registration to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'token', user: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await api.register('Test User', 'test@example.com', 'StrongPass1!', '9876543210');

    const [, config] = fetchMock.mock.calls[0];
    expect(JSON.parse(config.body)).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      password: 'StrongPass1!',
      mobile: '9876543210',
    });
  });

  it('omits absent optional Monte Carlo values instead of sending invalid nulls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.runMonteCarlo('FD', 5000, 10, null, null, 0);

    const [, config] = fetchMock.mock.calls[0];
    expect(JSON.parse(config.body)).toEqual({
      instrument: 'FD',
      monthly_investment: 5000,
      years: 10,
      current_savings: 0,
    });
  });

  it('surfaces backend validation details instead of a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      error: 'Validation failed',
      details: ['target_amount must be at least 1000'],
    }, 400)));

    await expect(api.runMonteCarlo('FD', 5000, 10, 500)).rejects.toThrow(
      'target_amount must be at least 1000'
    );
  });

  it('normalizes rupee allocations to the fractional weights required by Express', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ instruments: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.updateRecommendationWeights('64b000000000000000000001', {
      Equity_MF: 7500,
      Debt_MF: 2500,
    });

    const [, config] = fetchMock.mock.calls[0];
    expect(JSON.parse(config.body)).toEqual({
      profileId: '64b000000000000000000001',
      weights: {
        Equity_MF: 0.75,
        Debt_MF: 0.25,
      },
    });
  });

  it('routes market data through the same-origin API client and includes auth on refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ instrument_data_sources: {} }))
      .mockResolvedValueOnce(jsonResponse({ refreshed: true }));
    vi.stubGlobal('fetch', fetchMock);
    api.setAuthToken('market-token');

    await api.getMarketRates();
    await api.refreshMarketRates();

    const ratesUrl = fetchMock.mock.calls[0][0];
    const refreshUrl = fetchMock.mock.calls[1][0];
    expect(ratesUrl).toMatch(/\/api\/market\/rates$/);
    expect(refreshUrl).toBe(ratesUrl.replace('/market/rates', '/market/refresh'));
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer market-token');
  });
});
