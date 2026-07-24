import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SebiDisclaimer from '../SebiDisclaimer';

describe('SebiDisclaimer Component', () => {
  it('renders regulatory disclaimer text', () => {
    render(<SebiDisclaimer />);
    expect(screen.getByText(/Not SEBI-registered investment advice/i)).toBeTruthy();
    expect(screen.getByText(/Mutual fund investments are subject to market risk/i)).toBeTruthy();
  });
});
