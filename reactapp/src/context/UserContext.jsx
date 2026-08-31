/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';

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

export function UserProvider({ children }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [recommendations, setRecommendations] = useState([]);

  const updateProfile = (newProfile) => {
    setProfile(newProfile);
    if (!isProfileComplete) setRecommendations([]);
  };

  const completeProfile = (profileData) => {
    setProfile(profileData);
    setIsProfileComplete(true);
    setRecommendations([]);
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
