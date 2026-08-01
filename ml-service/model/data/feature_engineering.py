import numpy as np

# ── Canonical Feature Names and Display Maps ──
FEATURE_NAMES = [
    'age', 'annual_income', 'monthly_savings', 'investment_horizon',
    'liquid_savings', 'existing_debt', 'dependents', 'emergency_fund_months',
    'risk_score', 'stated_tolerance_score', 'savings_rate', 'debt_to_income_ratio',
    'emergency_fund_adequacy_ratio', 'risk_capacity_vs_stated_tolerance_gap',
    'horizon_adjusted_urgency_score', 'dependents_adjusted_burden_score'
]

FEATURE_DISPLAY = {
    'age': 'Your Age',
    'annual_income': 'Annual Income',
    'monthly_savings': 'Monthly Savings',
    'investment_horizon': 'Investment Horizon',
    'liquid_savings': 'Liquid Savings',
    'existing_debt': 'EMI Debt Burden',
    'dependents': 'Number of Dependents',
    'emergency_fund_months': 'Emergency Fund',
    'risk_score': 'Risk Capacity',
    'stated_tolerance_score': 'Stated Risk Appetite',
    'savings_rate': 'Savings Rate',
    'debt_to_income_ratio': 'Debt-to-Income Ratio',
    'emergency_fund_adequacy_ratio': 'Emergency Fund Adequacy',
    'risk_capacity_vs_stated_tolerance_gap': 'Risk Capacity vs. Appetite Gap',
    'horizon_adjusted_urgency_score': 'Goal Urgency Score',
    'dependents_adjusted_burden_score': 'Dependents & Debt Burden',
}

def get_feature_names():
    return FEATURE_NAMES

def calculate_capacity_score(age, annual_income, investment_horizon, emergency_fund_months, existing_debt, dependents):
    """
    Computes a continuous 0-100 risk capacity score based on financial variables:
    - Age (30% weight): Younger has higher capacity.
    - Income (25% weight): Higher income has higher capacity.
    - Horizon (20% weight): Longer horizon has higher capacity.
    - Emergency Fund (15% weight): Adequate emergency fund has higher capacity.
    - Debt Penalty (10% weight): Higher EMI burden reduces capacity.
    - Dependents Penalty: Each dependent reduces capacity by 2 points.
    """
    age_component = 100.0 * max(0.0, min(80.0 - age, 62.0)) / 62.0 if age < 80 else 0.0
    income_component = 100.0 * min(annual_income, 3000000.0) / 3000000.0
    horizon_component = 100.0 * min(investment_horizon, 30.0) / 30.0
    ef_component = 100.0 * min(emergency_fund_months, 12.0) / 12.0
    
    score = (
        0.30 * age_component +
        0.25 * income_component +
        0.20 * horizon_component +
        0.15 * ef_component -
        0.10 * existing_debt -
        2.0 * dependents
    )
    return float(max(0.0, min(100.0, score)))

def engineer_features(
    age, annual_income, monthly_savings, investment_horizon,
    liquid_savings, existing_debt, dependents, emergency_fund_months,
    risk_tolerance
):
    """
    Computes both raw features and domain-specific derived features.
    Accepts raw inputs and returns a dict with all 16 features.
    
    Exactly identical computation is guaranteed for training and serving.
    """
    # 1. Map risk tolerance to a stated tolerance score
    tolerance_map = {'Conservative': 20.0, 'Moderate': 60.0, 'Aggressive': 100.0}
    stated_tolerance_score = tolerance_map.get(risk_tolerance, 60.0)
    
    # 2. Calculate continuous capacity score (stored as risk_score for ML model)
    risk_score = calculate_capacity_score(
        age, annual_income, investment_horizon, emergency_fund_months, existing_debt, dependents
    )
    
    # 3. Compute derived features
    monthly_income = annual_income / 12.0 if annual_income > 0 else 0.0
    savings_rate = monthly_savings / monthly_income if monthly_income > 0 else 0.0
    savings_rate = min(savings_rate, 1.0)
    
    debt_to_income_ratio = existing_debt / 100.0
    emergency_fund_adequacy_ratio = emergency_fund_months / 6.0
    risk_capacity_vs_stated_tolerance_gap = risk_score - stated_tolerance_score
    horizon_adjusted_urgency_score = 100.0 * (1.0 - min(investment_horizon, 30.0) / 30.0)
    dependents_adjusted_burden_score = dependents * 10.0 + existing_debt
    
    return {
        'age': float(age),
        'annual_income': float(annual_income),
        'monthly_savings': float(monthly_savings),
        'investment_horizon': float(investment_horizon),
        'liquid_savings': float(liquid_savings),
        'existing_debt': float(existing_debt),
        'dependents': float(dependents),
        'emergency_fund_months': float(emergency_fund_months),
        'risk_score': round(risk_score, 4),
        'stated_tolerance_score': stated_tolerance_score,
        'savings_rate': round(savings_rate, 4),
        'debt_to_income_ratio': round(debt_to_income_ratio, 4),
        'emergency_fund_adequacy_ratio': round(emergency_fund_adequacy_ratio, 4),
        'risk_capacity_vs_stated_tolerance_gap': round(risk_capacity_vs_stated_tolerance_gap, 4),
        'horizon_adjusted_urgency_score': round(horizon_adjusted_urgency_score, 4),
        'dependents_adjusted_burden_score': round(dependents_adjusted_burden_score, 4)
    }

def to_model_array(features_dict):
    """
    Converts feature dictionary to the 16-feature array in correct order.
    """
    return np.array([[features_dict[name] for name in FEATURE_NAMES]])
