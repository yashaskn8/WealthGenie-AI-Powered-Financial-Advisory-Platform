/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LoadingState, ErrorState, EmptyState } from '../StateMessages';

afterEach(() => {
  cleanup();
});

describe('StateMessages Components — Loading, Error, and Empty States', () => {
  it('renders LoadingState with default and custom messages', () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading...')).toBeTruthy();

    rerender(<LoadingState message="Fetching tax analysis..." size="lg" />);
    expect(screen.getByText('Fetching tax analysis...')).toBeTruthy();
  });

  it('renders ErrorState with alert role and triggers onRetry callback', () => {
    const handleRetry = vi.fn();
    render(<ErrorState message="Server connection failed." onRetry={handleRetry} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Server connection failed.')).toBeTruthy();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeTruthy();
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders EmptyState with custom placeholder and call-to-action button', () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        message="No goals created yet. Start planning today!"
        actionLabel="Create Goal"
        onAction={handleAction}
      />
    );

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('No goals created yet. Start planning today!')).toBeTruthy();

    const actionBtn = screen.getByRole('button', { name: /create goal/i });
    expect(actionBtn).toBeTruthy();
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});
