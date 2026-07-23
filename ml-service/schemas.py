from pydantic import BaseModel, Field, model_validator
from typing import Dict, List, Optional, Literal


class PredictRequest(BaseModel):
    age: int = Field(..., ge=18, le=80, description="User age in years")
    annual_income: float = Field(..., gt=0, le=100000000, description="Annual income in INR (max ₹10Cr)")
    monthly_savings: float = Field(..., ge=0, description="Monthly savings in INR")
    risk_category: Literal['Conservative', 'Conservative-Moderate', 'Moderate', 'Moderate-Aggressive', 'Aggressive'] = Field(
        ...,
        description="Risk category based on capacity"
    )
    liquid_savings: float = Field(..., ge=0, description="Existing liquid savings in INR")
    existing_debt: float = Field(..., ge=0, le=100, description="EMI burden as % of monthly income")
    dependents: int = Field(..., ge=0, le=15, description="Number of dependents")
    emergency_fund_months: float = Field(..., ge=0, description="Months of emergency fund saved")
    risk_tolerance: Literal['Conservative', 'Moderate', 'Aggressive'] = Field(..., description="Self-reported risk tolerance")
    goal_type: Literal['retirement', 'house purchase', 'education', 'wealth-building'] = Field(..., description="Primary goal type")
    investment_horizon: Optional[int] = Field(15, ge=1, le=40, description="Investment horizon in years")

    @model_validator(mode='after')
    def savings_must_be_reasonable(self):
        if self.monthly_savings > self.annual_income / 12:
            raise ValueError(
                f'Monthly savings (₹{self.monthly_savings:,.0f}) cannot exceed '
                f'monthly income (₹{self.annual_income/12:,.0f})'
            )
        return self


class FeatureContribution(BaseModel):
    feature: str
    display_name: str
    shap_value: float
    direction: str
    magnitude: float
    raw_value: float


class Explanation(BaseModel):
    predicted_class: str
    confidence: float
    feature_contributions: List[FeatureContribution]
    top_reason: str


class PredictResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    primary: str
    secondary: str
    tertiary: str
    confidence_scores: Dict[str, float]
    decision_path: List[str]
    model_used: Optional[str] = "RandomForest"
    low_confidence: Optional[bool] = False
    confidence_threshold: Optional[float] = 0.55
    model_version: Optional[str] = "3.0.0"
    dataset_version: Optional[str] = "3.0.0"
    git_commit_hash: Optional[str] = "ffa37ba"
    explanation: Optional[Explanation] = None


class HealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    status: str
    model_version: str
    model_accuracy: Optional[float] = None
    explainer_loaded: Optional[bool] = None
