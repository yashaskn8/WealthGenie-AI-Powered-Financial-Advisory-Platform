import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '../ProfilePage.jsx';
import * as api from '../../services/api.js';

function ProfileProbe({ userProfile, onProfileUpdate }) {
  return (
    <div>
      <span data-testid="profile-version">{userProfile.version}</span>
      <button
        type="button"
        onClick={() => onProfileUpdate({ ...userProfile, version: userProfile.version + 1 })}
      >
        Apply update
      </button>
    </div>
  );
}

describe('ProfilePage backend version contract', () => {
  beforeEach(() => {
    localStorage.clear();
    api.setUserInfo({ id: 'user-1' });
  });

  it('restores the latest backend version in memory without browser persistence', async () => {
    vi.spyOn(api, 'getCurrentProfile').mockResolvedValue({
      profileId: '64b000000000000000000001',
      version: 2,
      age: 32,
      monthly_income: 65000,
      monthly_savings: 12000,
      investment_goals: [],
    });

    render(
      <ProfilePage>
        <ProfileProbe />
      </ProfilePage>
    );

    expect((await screen.findByTestId('profile-version')).textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));
    expect(screen.getByTestId('profile-version').textContent).toBe('3');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
