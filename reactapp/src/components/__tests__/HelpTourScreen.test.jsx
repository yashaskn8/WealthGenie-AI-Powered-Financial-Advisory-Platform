import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import HelpTourScreen from '../../HelpTourScreen';

beforeAll(() => {
  global.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('HelpTourScreen Component', () => {
  it('renders platform documentation title and strategy dashboard card', () => {
    render(<HelpTourScreen />);
    expect(screen.getByText('Guide')).toBeTruthy();
    expect(screen.getByText('Strategy Dashboard')).toBeTruthy();
  });
});
