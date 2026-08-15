"""
WealthGenie ML Microservice - Preprocessing Module
Handles feature normalization, tensor formatting, and preprocessor persistence.
"""

import sys
from pathlib import Path

_ml_service_dir = str(Path(__file__).resolve().parent.parent)
if _ml_service_dir not in sys.path:
    sys.path.insert(0, _ml_service_dir)

import json
import joblib
import numpy as np
import torch
from sklearn.preprocessing import StandardScaler
from typing import Dict, Tuple, Any, Optional

from model.config import ArtifactPaths, PyTorchModelConfig




class FeaturePreprocessor:
    """Standardizes numerical features and formats data for PyTorch neural network training and inference."""

    def __init__(self):
        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        """Fits the scaler on training feature matrix X and returns scaled features."""
        X_scaled = self.scaler.fit_transform(X)
        self.is_fitted = True
        return X_scaled

    def transform(self, X: np.ndarray) -> np.ndarray:
        """Transforms feature matrix X using the fitted scaler."""
        if not self.is_fitted:
            raise RuntimeError("Preprocessor must be fitted or loaded before calling transform()")
        return self.scaler.transform(X)

    def transform_to_tensor(self, X: np.ndarray, device: torch.device) -> torch.Tensor:
        """Scales feature matrix X and returns a PyTorch FloatTensor on the target device."""
        X_scaled = self.transform(X)
        return torch.tensor(X_scaled, dtype=torch.float32, device=device)

    def save(self, scaler_path: Path) -> None:
        """Persists the fitted StandardScaler object to disk."""
        if not self.is_fitted:
            raise RuntimeError("Cannot save an unfitted preprocessor")
        scaler_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.scaler, scaler_path)

    def load(self, scaler_path: Path) -> None:
        """Loads a pre-fitted StandardScaler object from disk."""
        if not scaler_path.exists():
            raise FileNotFoundError(f"Scaler artifact not found at {scaler_path}")
        self.scaler = joblib.load(scaler_path)
        self.is_fitted = True


def prepare_synthetic_training_data(
    num_samples: int = 1500, seed: int = 42
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generates synthetic training dataset covering all 16 features and 6 target investment categories:
    [Equity_MF, ELSS, ETF, Debt_MF, FD, RBI_Bond].
    """
    np.random.seed(seed)

    # 1. Generate 16 raw/engineered features
    age = np.random.uniform(20, 75, num_samples)
    annual_income = np.random.uniform(300000, 5000000, num_samples)
    monthly_savings = np.random.uniform(5000, 150000, num_samples)
    investment_horizon = np.random.uniform(1, 30, num_samples)
    liquid_savings = np.random.uniform(20000, 2000000, num_samples)
    existing_debt = np.random.uniform(0, 50, num_samples)
    dependents = np.random.randint(0, 5, num_samples)
    emergency_fund_months = np.random.uniform(0, 12, num_samples)
    
    # Derived features
    risk_score = np.random.uniform(10, 95, num_samples)
    stated_tolerance_score = np.random.choice([20.0, 60.0, 100.0], num_samples)
    savings_rate = np.clip(monthly_savings / (annual_income / 12.0), 0.0, 1.0)
    debt_to_income = existing_debt / 100.0
    ef_adequacy = emergency_fund_months / 6.0
    gap = risk_score - stated_tolerance_score
    urgency = 100.0 * (1.0 - np.minimum(investment_horizon, 30.0) / 30.0)
    burden = dependents * 10.0 + existing_debt

    X = np.column_stack([
        age, annual_income, monthly_savings, investment_horizon,
        liquid_savings, existing_debt, dependents, emergency_fund_months,
        risk_score, stated_tolerance_score, savings_rate, debt_to_income,
        ef_adequacy, gap, urgency, burden
    ])

    # 2. Rule-based synthetic target labels (0 to 5)
    # 0: Equity_MF, 1: ELSS, 2: ETF, 3: Debt_MF, 4: FD, 5: RBI_Bond
    y = np.zeros(num_samples, dtype=int)
    for i in range(num_samples):
        if age[i] > 60 or emergency_fund_months[i] < 2:
            if risk_score[i] < 30:
                y[i] = 5  # RBI_Bond
            else:
                y[i] = 4  # FD
        elif investment_horizon[i] >= 3 and annual_income[i] >= 800000 and age[i] <= 50 and np.random.rand() > 0.4:
            y[i] = 1  # ELSS
        elif risk_score[i] >= 65 and investment_horizon[i] >= 5:
            y[i] = 0  # Equity_MF
        elif risk_score[i] >= 45 and investment_horizon[i] >= 3:
            y[i] = 2  # ETF
        elif risk_score[i] >= 30:
            y[i] = 3  # Debt_MF
        elif risk_score[i] >= 20:
            y[i] = 4  # FD
        else:
            y[i] = 5  # RBI_Bond

    return X, y


import hashlib


def compute_dataset_hash_from_arrays(X: np.ndarray, y: np.ndarray) -> str:
    """Computes a deterministic SHA-256 hash over the combined feature matrix and labels."""
    combined = np.column_stack([X, y.reshape(-1, 1)]).astype(np.float64)
    return hashlib.sha256(combined.tobytes()).hexdigest()


def get_dataset_generation_params(num_samples: int = 1500, seed: int = 42) -> Dict[str, Any]:
    """Returns the exact generation parameters required to deterministically reproduce the training data."""
    return {
        "generator_name": "prepare_synthetic_training_data",
        "seed": seed,
        "num_samples": num_samples,
        "feature_count": 16,
        "class_count": 6,
        "age_range": [20.0, 75.0],
        "income_range": [300000.0, 5000000.0],
        "monthly_savings_range": [5000.0, 150000.0],
        "investment_horizon_range": [1.0, 30.0],
        "target_classes": ["Equity_MF", "ELSS", "ETF", "Debt_MF", "FD", "RBI_Bond"],
    }


def regenerate_synthetic_dataset_and_hash(params: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray, str]:
    """
    Given stored generation parameters from a registered model version's lineage metadata,
    independently regenerates the exact training dataset and returns (X, y, sha256_hash).
    """
    seed = params.get("seed", 42)
    num_samples = params.get("num_samples", 1500)
    X, y = prepare_synthetic_training_data(num_samples=num_samples, seed=seed)
    data_hash = compute_dataset_hash_from_arrays(X, y)
    return X, y, data_hash

