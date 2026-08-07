import React, { useState, useMemo, useCallback } from 'react';
import { User } from 'lucide-react';
import profileImg from '../assets/gen_4k_nobull.png';
import * as api from '../services/api';

const PROFILE_STORAGE_KEY = 'wealthgenie_user_profile';

const ProfilePage = ({ onCompleteProfile: _onCompleteProfile, children }) => {
  // Try to load saved profile from localStorage, scoped to the current user
  const savedProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Ensure the saved profile belongs to the current authenticated user
      const currentUser = api.getUserInfo();
      if (currentUser && parsed._userId && parsed._userId !== currentUser.id) {
        // Different user - discard stale profile
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch { return null; }
  }, []);

  const [isComplete, setIsComplete] = useState(!!savedProfile);
  const [age, setAge] = useState(savedProfile?.age || 32);
  const [monthlyIncome, setMonthlyIncome] = useState(savedProfile?.monthly_income || 65000);
  const [monthlySavings, setMonthlySavings] = useState(savedProfile?.monthly_savings || 12000);
  const [investmentGoals, setInvestmentGoals] = useState(savedProfile?.investment_goals || ['Retirement', 'Wealth Growth']);
  const [horizon, setHorizon] = useState(savedProfile?.investment_horizon || 15);
  const [taxRegime, setTaxRegime] = useState(savedProfile?.taxRegime || 'new');
  const [profileId, setProfileId] = useState(savedProfile?.profileId || null);

  // New fields (CTC, Basic, Take-Home, Property Sale, Lump Sum):
  const [totalCTC, setTotalCTC] = useState(savedProfile?.total_ctc !== undefined ? savedProfile.total_ctc : (savedProfile?.monthly_income ? savedProfile.monthly_income * 12 : 780000));
  const [basicComponent, setBasicComponent] = useState(savedProfile?.basic_component !== undefined ? savedProfile.basic_component : (savedProfile?.total_ctc ? savedProfile.total_ctc * 0.5 : 390000));
  const [monthlyTakeHome, setMonthlyTakeHome] = useState(savedProfile?.monthly_take_home !== undefined ? savedProfile.monthly_take_home : (savedProfile?.monthly_income || 65000));
  const [soldPropertyAmount, setSoldPropertyAmount] = useState(savedProfile?.sold_property_amount !== undefined ? savedProfile.sold_property_amount : 0);
  const [hasLumpSum, setHasLumpSum] = useState(savedProfile?.has_lump_sum !== undefined ? savedProfile.has_lump_sum : false);
  const [lumpSumAmount, setLumpSumAmount] = useState(savedProfile?.lump_sum_amount !== undefined ? savedProfile.lump_sum_amount : 0);

  // New fields (risk/goal metadata):
  const [liquidSavings, setLiquidSavings] = useState(savedProfile?.liquid_savings !== undefined ? savedProfile.liquid_savings : 0);
  const [existingDebt, setExistingDebt] = useState(savedProfile?.existing_debt !== undefined ? savedProfile.existing_debt : 0);
  const [dependents, setDependents] = useState(savedProfile?.dependents !== undefined ? savedProfile.dependents : 0);
  const [emergencyFundMonths, setEmergencyFundMonths] = useState(savedProfile?.emergency_fund_months !== undefined ? savedProfile.emergency_fund_months : 0);
  const [riskTolerance, setRiskTolerance] = useState(savedProfile?.risk_tolerance || 'Moderate');
  const [goalType, setGoalType] = useState(savedProfile?.goal_type || 'wealth-building');

  const toggleGoal = (goal) => {
    setInvestmentGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const userProfilePayload = useMemo(() => ({
    age: Number(age),
    monthly_income: Number(monthlyIncome),
    monthly_savings: Number(monthlySavings),
    investment_goals: investmentGoals,
    investment_horizon: horizon,
    taxRegime,
    profileId,
    liquid_savings: Number(liquidSavings),
    existing_debt: Number(existingDebt),
    dependents: Number(dependents),
    emergency_fund_months: Number(emergencyFundMonths),
    risk_tolerance: riskTolerance,
    goal_type: goalType,
    total_ctc: Number(totalCTC),
    basic_component: Number(basicComponent),
    monthly_take_home: Number(monthlyTakeHome),
    sold_property_amount: Number(soldPropertyAmount),
    has_lump_sum: Boolean(hasLumpSum),
    lump_sum_amount: hasLumpSum ? Number(lumpSumAmount) : 0,
  }), [
    age, monthlyIncome, monthlySavings, investmentGoals, horizon, taxRegime, profileId,
    liquidSavings, existingDebt, dependents, emergencyFundMonths, riskTolerance, goalType,
    totalCTC, basicComponent, monthlyTakeHome, soldPropertyAmount, hasLumpSum, lumpSumAmount
  ]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();

    // ── Frontend validation (catch errors before API call) ──
    const numAge = Number(age);
    const numIncome = Number(monthlyIncome);
    const numSavings = Number(monthlySavings);
    const numLiquid = Number(liquidSavings);
    const numDebt = Number(existingDebt);
    const numDeps = Number(dependents);
    const numEf = Number(emergencyFundMonths);
    const numCTC = Number(totalCTC);
    const numBasic = Number(basicComponent);
    const numTakeHome = Number(monthlyTakeHome);
    const numPropSale = Number(soldPropertyAmount);
    const numLumpSum = Number(lumpSumAmount);

    if (!numAge || isNaN(numAge) || numAge < 18 || numAge > 80) {
      alert('Please enter a valid age between 18 and 80.');
      return;
    }
    if (!numIncome || isNaN(numIncome) || numIncome < 1000 || numIncome > 100000000) {
      alert('Monthly income must be between ₹1,000 and ₹10,00,00,000 (10 Crores).');
      return;
    }
    if (!numSavings || isNaN(numSavings) || numSavings < 500 || numSavings > 100000000) {
      alert('Monthly savings must be between ₹500 and ₹10,00,00,000 (10 Crores).');
      return;
    }
    if (numSavings >= numIncome) {
      alert('Monthly savings must be less than monthly income.');
      return;
    }
    if (!numCTC || isNaN(numCTC) || numCTC < 100000 || numCTC > 1000000000) {
      alert('Total CTC must be between ₹1,00,000 and ₹100 Crores.');
      return;
    }
    if (!numBasic || isNaN(numBasic) || numBasic < 20000 || numBasic > numCTC * 0.6) {
      alert('Basic salary component must be between ₹20,000 and 60% of Total CTC.');
      return;
    }
    if (numBasic < numCTC * 0.2) {
      alert('Basic salary component must be at least 20% of Total CTC.');
      return;
    }
    if (!numTakeHome || isNaN(numTakeHome) || (numTakeHome * 12 > numCTC)) {
      alert('Annualized monthly take-home salary cannot exceed Total CTC.');
      return;
    }
    if (isNaN(numPropSale) || numPropSale < 0) {
      alert('Sold property proceeds must be a positive number.');
      return;
    }
    if (hasLumpSum && (!numLumpSum || numLumpSum <= 0)) {
      alert('Please enter a lump sum investment amount greater than 0 when "Has Lump Sum" is enabled.');
      return;
    }

    try {
      const response = await api.buildProfile(
        numIncome, numAge, numSavings, taxRegime, horizon,
        numLiquid, numDebt, numDeps, numEf, riskTolerance, goalType,
        numCTC, numBasic, numTakeHome, numPropSale, hasLumpSum, hasLumpSum ? numLumpSum : 0
      );
      // Persist profile to localStorage, scoped to the current user
      const currentUser = api.getUserInfo();
      const nextProfileId = response.profileId || null;
      setProfileId(nextProfileId);
      const profileWithUser = { ...userProfilePayload, profileId: nextProfileId, _userId: currentUser?.id || null };
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileWithUser));
      setIsComplete(true);
    } catch (err) {
      alert("Error saving profile: " + err.message);
    }
  };

  // Called from DashboardShell when profile is updated inline
  const handleProfileUpdate = useCallback((updatedProfile) => {
    setAge(updatedProfile.age);
    setMonthlyIncome(updatedProfile.monthly_income);
    setMonthlySavings(updatedProfile.monthly_savings);
    setInvestmentGoals(updatedProfile.investment_goals);
    setHorizon(updatedProfile.investment_horizon);
    setTaxRegime(updatedProfile.taxRegime);
    
    // New fields:
    if (updatedProfile.liquid_savings !== undefined) setLiquidSavings(updatedProfile.liquid_savings);
    if (updatedProfile.existing_debt !== undefined) setExistingDebt(updatedProfile.existing_debt);
    if (updatedProfile.dependents !== undefined) setDependents(updatedProfile.dependents);
    if (updatedProfile.emergency_fund_months !== undefined) setEmergencyFundMonths(updatedProfile.emergency_fund_months);
    if (updatedProfile.risk_tolerance !== undefined) setRiskTolerance(updatedProfile.risk_tolerance);
    if (updatedProfile.goal_type !== undefined) setGoalType(updatedProfile.goal_type);
    if (updatedProfile.total_ctc !== undefined) setTotalCTC(updatedProfile.total_ctc);
    if (updatedProfile.basic_component !== undefined) setBasicComponent(updatedProfile.basic_component);
    if (updatedProfile.monthly_take_home !== undefined) setMonthlyTakeHome(updatedProfile.monthly_take_home);
    if (updatedProfile.sold_property_amount !== undefined) setSoldPropertyAmount(updatedProfile.sold_property_amount);
    if (updatedProfile.has_lump_sum !== undefined) setHasLumpSum(updatedProfile.has_lump_sum);
    if (updatedProfile.lump_sum_amount !== undefined) setLumpSumAmount(updatedProfile.lump_sum_amount);

    const nextProfileId = updatedProfile.profileId || profileId || null;
    setProfileId(nextProfileId);
    const currentUser = api.getUserInfo();
    const profileWithUser = { ...updatedProfile, profileId: nextProfileId, _userId: currentUser?.id || null };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileWithUser));
  }, [profileId]);

  if (isComplete) {
    return React.cloneElement(children, {
      userProfile: userProfilePayload,
      onProfileUpdate: handleProfileUpdate
    });
  }

  return (
    <main className="profile-page">
      {/* Form content on the left */}
      <div className="profile-content">
        <h1 className="profile-page-title">
          Create Your <span className="gradient-text">Financial Profile</span>
        </h1>

        <div className="profile-form-card">
          {/* Profile Summary Quick Badge */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.85rem'
          }}>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem' }}>Total CTC</span>
              <strong style={{ color: '#38bdf8' }}>₹{Number(totalCTC || 0).toLocaleString('en-IN')}/yr</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem' }}>Basic Salary</span>
              <strong style={{ color: '#f1f5f9' }}>₹{Number(basicComponent || 0).toLocaleString('en-IN')}/yr</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem' }}>Take-Home</span>
              <strong style={{ color: '#4ade80' }}>₹{Number(monthlyTakeHome || 0).toLocaleString('en-IN')}/mo</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem' }}>Lump Sum Deployment</span>
              <strong style={{ color: hasLumpSum ? '#fbbf24' : '#94a3b8' }}>
                {hasLumpSum ? `₹${Number(lumpSumAmount || 0).toLocaleString('en-IN')}` : 'None'}
              </strong>
            </div>
          </div>

          <form onSubmit={handleSaveProfile}>
            {/* CTC & Salary Structure */}
            <div className="pf-grid-2">
              <div className="pf-field">
                <label>Total CTC (Annual ₹)</label>
                <div className="pf-input-prefix">
                  <span className="prefix-symbol">₹</span>
                  <input 
                    type="number" 
                    placeholder="780000" 
                    value={totalCTC || ''} 
                    onChange={e => {
                      let val = e.target.value.replace(/^0+/, '');
                      let num = val === '' ? '' : Number(val);
                      setTotalCTC(num);
                      if (num && !basicComponent) setBasicComponent(Math.round(num * 0.5));
                      if (num && !monthlyTakeHome) setMonthlyTakeHome(Math.round(num / 12));
                    }} 
                  />
                </div>
              </div>
              <div className="pf-field">
                <label>Basic Salary Component (Annual ₹)</label>
                <div className="pf-input-prefix">
                  <span className="prefix-symbol">₹</span>
                  <input 
                    type="number" 
                    placeholder="390000" 
                    value={basicComponent || ''} 
                    onChange={e => {
                      let val = e.target.value.replace(/^0+/, '');
                      setBasicComponent(val === '' ? '' : Number(val));
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* Income & Take Home */}
            <div className="pf-grid-2">
              <div className="pf-field">
                <label>Monthly Take-Home (₹)</label>
                <div className="pf-input-prefix">
                  <span className="prefix-symbol">₹</span>
                  <input 
                    type="number" 
                    placeholder="65000" 
                    value={monthlyTakeHome || ''} 
                    onChange={e => {
                      let val = e.target.value.replace(/^0+/, '');
                      let num = val === '' ? '' : Number(val);
                      setMonthlyTakeHome(num);
                      if (num) setMonthlyIncome(num);
                    }} 
                  />
                </div>
              </div>
              <div className="pf-field">
                <label>Monthly Savings Capacity (₹)</label>
                <div className="pf-input-prefix">
                  <span className="prefix-symbol">₹</span>
                  <input 
                    type="number" 
                    placeholder="12000" 
                    value={monthlySavings || ''} 
                    onChange={e => {
                      let val = e.target.value.replace(/^0+/, '');
                      if (val === '') {
                        setMonthlySavings('');
                      } else {
                        let num = Number(val);
                        if (num > 100000000) num = 100000000;
                        setMonthlySavings(num);
                      }
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* Age & Risk Appetite */}
            <div className="pf-grid-2">
              <div className="pf-field">
                <label>Age</label>
                <input 
                  type="number" 
                  placeholder="32" 
                  value={age || ''} 
                  onChange={e => {
                    let val = e.target.value.replace(/^0+/, '');
                    setAge(val === '' ? '' : Number(val));
                  }} 
                  min="18" 
                  max="80" 
                />
              </div>
              <div className="pf-field">
                <label>Risk Tolerance</label>
                <div className="risk-toggle-group">
                  {['Conservative', 'Moderate', 'Aggressive'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`risk-toggle-btn ${riskTolerance === level ? 'active' : ''}`}
                      onClick={() => setRiskTolerance(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* One-Time Capital & Liquidity */}
            <div className="pf-grid-2">
              <div className="pf-field">
                <label>Sold Property Proceeds (₹)</label>
                <div className="pf-input-prefix">
                  <span className="prefix-symbol">₹</span>
                  <input 
                    type="number" 
                    placeholder="2000000" 
                    value={soldPropertyAmount || ''} 
                    onChange={e => {
                      let val = e.target.value.replace(/^0+/, '');
                      setSoldPropertyAmount(val === '' ? 0 : Number(val));
                    }} 
                  />
                </div>
              </div>
              <div className="pf-field">
                <label>Has Lump Sum to Invest?</label>
                <div className="risk-toggle-group">
                  <button
                    type="button"
                    className={`risk-toggle-btn ${!hasLumpSum ? 'active' : ''}`}
                    onClick={() => {
                      setHasLumpSum(false);
                      setLumpSumAmount(0);
                    }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className={`risk-toggle-btn ${hasLumpSum ? 'active' : ''}`}
                    onClick={() => setHasLumpSum(true)}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>

            {/* Conditional Lump Sum Amount & Action button */}
            {hasLumpSum && (
              <div className="pf-field pf-field-full" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label>Lump Sum Investment Amount (₹)</label>
                  {Number(soldPropertyAmount) > 0 && (
                    <button
                      type="button"
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        color: '#60a5fa',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                      onClick={() => setLumpSumAmount(Number(soldPropertyAmount))}
                    >
                      Use my property sale amount (₹{Number(soldPropertyAmount).toLocaleString('en-IN')})
                    </button>
                  )}
                </div>
                <div className="pf-input-prefix">
                  <span className="prefix-symbol">₹</span>
                  <input 
                    type="number" 
                    placeholder="2000000" 
                    value={lumpSumAmount || ''} 
                    onChange={e => {
                      let val = e.target.value.replace(/^0+/, '');
                      setLumpSumAmount(val === '' ? '' : Number(val));
                    }} 
                  />
                </div>
              </div>
            )}

            {/* Row 3: Goal Checkboxes */}
            <div className="pf-field pf-field-full">
              <label>Investment Goal</label>
              <div className="goal-checkbox-group">
                {['Retirement', 'Wealth Growth', 'Tax Saving', 'Emergency Fund'].map((goal) => (
                  <label key={goal} className="goal-checkbox">
                    <input
                      type="checkbox"
                      checked={investmentGoals.includes(goal)}
                      onChange={() => toggleGoal(goal)}
                    />
                    <span className="goal-checkmark"></span>
                    <span className="goal-label-text">{goal}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Row 4: Horizon Slider */}
            <div className="pf-field pf-field-full">
              <label>Investment Horizon</label>
              <div className="horizon-slider-container">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="horizon-slider"
                  style={{ '--slider-pct': `${((horizon - 1) / 29) * 100}%` }}
                />
                <div className="horizon-labels">
                  <span>1</span>
                  <span className="horizon-value">{horizon} {horizon === 1 ? 'Year' : 'Years'}</span>
                  <span>30</span>
                </div>
              </div>
            </div>


            <button type="submit" className="btn-save-continue">
              Save and Continue
            </button>
          </form>
        </div>
      </div>
      
      {/* Right image pane */}
      <div className="profile-side-image">
        <img src={profileImg} alt="Financial Profile" className="profile-img-element" />
        <div className="profile-img-overlay"></div>
      </div>

    </main>
  );
};

export default ProfilePage;
