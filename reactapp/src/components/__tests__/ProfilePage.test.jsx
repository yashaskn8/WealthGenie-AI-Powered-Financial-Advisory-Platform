import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ProfilePage from '../ProfilePage.jsx';
import * as api from '../../services/api.js';

const PROFILE_STORAGE_KEY = 'wealthgenie_user_profile';

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

  it('keeps the latest backend version in the profile passed to the editor', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      _userId: 'user-1',
      profileId: '64b000000000000000000001',
      version: 2,
      age: 32,
      monthly_income: 65000,
      monthly_savings: 12000,
    }));

    render(
      <ProfilePage>
        <ProfileProbe />
      </ProfilePage>
    );

    expect(screen.getByTestId('profile-version').textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));
    expect(screen.getByTestId('profile-version').textContent).toBe('3');
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)).version).toBe(3);
  });
});
