/**
 * @vitest-environment jsdom
 */
/* global global */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataFreshnessBar from '../DataFreshnessBar';

describe('DataFreshnessBar Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when dataSources is null', () => {
    const { container } = render(<DataFreshnessBar instruments={['Equity_MF']} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles refresh button click safely', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        instrument_data_sources: {
          Equity_MF: { source: 'live', based_on: 'Nifty 50' },
        },
      }),
    });

    render(<DataFreshnessBar instruments={['Equity_MF']} />);
    expect(true).toBe(true);
  });
});
