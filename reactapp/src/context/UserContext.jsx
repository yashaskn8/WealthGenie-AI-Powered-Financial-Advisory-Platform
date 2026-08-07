/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { generateRecommendations } from '../recommendationEngine';

const UserContext = createContext(null);

const DEFAULT_PROFILE = {
  age: 32,
  monthly_income: 65000,
  monthly_savings: 12000,
  riskCategory: 'Moderate',
  risk_tolerance: 'Moderate',
  investment_goals: ['Retirement', 'Wealth Growth'],
  investment_horizon: 15,
};

function readStoredProfile() {
  try {
    const saved = localStorage.getItem('wg_profile');
    return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function UserProvider({ children }) {
  const [profile, setProfile] = useState(readStoredProfile);

  const [isProfileComplete, setIsProfileComplete] = useState(() => {
    return localStorage.getItem('wg_profile_complete') === 'true';
  });

  const [recommendations, setRecommendations] = useState(() => {
    const prof = readStoredProfile();
    const complete = localStorage.getItem('wg_profile_complete') === 'true';
    return complete ? generateRecommendations(prof) : [];
  });

  // Persist profile
  useEffect(() => {
    localStorage.setItem('wg_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('wg_profile_complete', String(isProfileComplete));
  }, [isProfileComplete]);

  const updateProfile = (newProfile) => {
    setProfile(newProfile);
    setRecommendations(isProfileComplete ? generateRecommendations(newProfile) : []);
  };

  const completeProfile = (profileData) => {
    setProfile(profileData);
    setIsProfileComplete(true);
    setRecommendations(generateRecommendations(profileData));
  };

  const resetProfile = () => {
    setIsProfileComplete(false);
    setRecommendations([]);
  };

  const updateRecommendations = (newRecs) => {
    setRecommendations(newRecs);
  };

  return (
    <UserContext.Provider value={{
      profile,
      recommendations,
      isProfileComplete,
      updateProfile,
      completeProfile,
      resetProfile,
      updateRecommendations
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within a UserProvider');
  return ctx;
}
