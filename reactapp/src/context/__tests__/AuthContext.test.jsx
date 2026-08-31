import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import * as api from '../../services/api';

function SessionProbe() {
  const { isAuthenticated, user } = useAuth();
  return <div>{isAuthenticated ? `signed-in:${user?.id}` : 'signed-out'}</div>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    api.clearUserSession();
    localStorage.clear();
  });

  it('reacts immediately to login and logout session changes', () => {
    render(<AuthProvider restoreOnMount={false}><SessionProbe /></AuthProvider>);
    expect(screen.getByText('signed-out')).toBeInTheDocument();

    act(() => {
      api.setUserInfo({ id: 'user-42' });
      api.setAuthToken('token-42');
    });
    expect(screen.getByText('signed-in:user-42')).toBeInTheDocument();

    act(() => api.clearUserSession());
    expect(screen.getByText('signed-out')).toBeInTheDocument();
  });
});
