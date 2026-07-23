import os
import numpy as np
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from feature_engineering import engineer_features, to_model_array, get_feature_names
from schemas import PredictRequest
from main import app, get_decision_path_description, model

client_instance = None

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

API_KEY = "wealthgenie_secret_api_key_2026"

def test_predict_request_rejects_monthly_savings_above_income():
    with pytest.raises(ValidationError):
        PredictRequest(
            age=30,
            annual_income=120000,
            monthly_savings=20000,
            risk_category='Moderate',
            liquid_savings=10000,
            existing_debt=10.0,
            dependents=1,
            emergency_fund_months=3.0,
            risk_tolerance='Moderate',
            goal_type='wealth-building',
            investment_horizon=15
        )

def test_feature_parity_train_inference():
    """
    Asserts byte-for-byte identical output for training and inference paths.
    """
    raw_inputs = {
        'age': 34,
        'annual_income': 1500000.0,
        'monthly_savings': 35000.0,
        'investment_horizon': 12,
        'liquid_savings': 500000.0,
        'existing_debt': 15.0,
        'dependents': 2,
        'emergency_fund_months': 4.0,
        'risk_tolerance': 'Moderate'
    }
    
    # Compute via feature_engineering directly
    feat_train = engineer_features(**raw_inputs)
    arr_train = to_model_array(feat_train)
    
    # Mimic main.py parsing & serving transformation
    req = PredictRequest(
        risk_category='Moderate',
        goal_type='wealth-building',
        **raw_inputs
    )
    
    feat_serve = engineer_features(
        age=req.age,
        annual_income=req.annual_income,
        monthly_savings=req.monthly_savings,
        investment_horizon=req.investment_horizon,
        liquid_savings=req.liquid_savings,
        existing_debt=req.existing_debt,
        dependents=req.dependents,
        emergency_fund_months=req.emergency_fund_months,
        risk_tolerance=req.risk_tolerance
    )
    arr_serve = to_model_array(feat_serve)
    
    # Assert exact byte-for-byte matching of array dimensions, content and types
    assert arr_train.shape[1] == len(get_feature_names())
    assert arr_serve.shape[1] == len(get_feature_names())
    np.testing.assert_array_equal(arr_train, arr_serve)

def test_api_key_security_unauthorized(client, monkeypatch):
    # Temporarily set the API key so auth enforcement is active (in CI it's unset)
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    payload = {
        "age": 30,
        "annual_income": 1200000,
        "monthly_savings": 40000,
        "risk_category": "Moderate",
        "liquid_savings": 5000,
        "existing_debt": 0.0,
        "dependents": 0,
        "emergency_fund_months": 3.0,
        "risk_tolerance": "Moderate",
        "goal_type": "wealth-building",
        "investment_horizon": 15
    }
    # No header
    response = client.post("/predict/enriched", json=payload)
    assert response.status_code == 401
    assert "Invalid or missing API Key" in response.json()["detail"]

    # Wrong key
    response = client.post("/predict/enriched", json=payload, headers={"X-API-Key": "wrong_key"})
    assert response.status_code == 401

def test_api_key_security_authorized(client, monkeypatch):
    if model is None:
        pytest.skip("Model .pkl not available in CI — skipping authorized prediction test")
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    payload = {
        "age": 30,
        "annual_income": 1200000,
        "monthly_savings": 40000,
        "risk_category": "Moderate",
        "liquid_savings": 5000,
        "existing_debt": 0.0,
        "dependents": 0,
        "emergency_fund_months": 3.0,
        "risk_tolerance": "Moderate",
        "goal_type": "wealth-building",
        "investment_horizon": 15
    }
    response = client.post("/predict/enriched", json=payload, headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    assert "primary" in response.json()

def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["ok", "model_not_loaded"]
    assert "model_version" in data

def test_predict_enriched_endpoint_valid(client):
    if model is None:
        pytest.skip("Model .pkl not available in CI — skipping enriched prediction test")
    payload = {
        "age": 30,
        "annual_income": 1200000,
        "monthly_savings": 40000,
        "risk_category": "Moderate",
        "liquid_savings": 50000,
        "existing_debt": 12,
        "dependents": 2,
        "emergency_fund_months": 3,
        "risk_tolerance": "Moderate",
        "goal_type": "wealth-building",
        "investment_horizon": 15
    }
    response = client.post("/predict/enriched", json=payload, headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    data = response.json()
    assert "primary" in data
    assert "secondary" in data
    assert "tertiary" in data
    assert "confidence_scores" in data
    assert "explanation" in data
    assert data["enriched_features"]["savings_rate"] == 0.4000
    assert "model_version" in data

def test_predict_enriched_endpoint_invalid_savings(client):
    payload = {
        "age": 30,
        "annual_income": 1200000,
        "monthly_savings": 150000,  # exceeds monthly income (100k)
        "risk_category": "Moderate",
        "liquid_savings": 50000,
        "existing_debt": 12,
        "dependents": 2,
        "emergency_fund_months": 3,
        "risk_tolerance": "Moderate",
        "goal_type": "wealth-building",
        "investment_horizon": 15
    }
    response = client.post("/predict/enriched", json=payload, headers={"X-API-Key": API_KEY})
    assert response.status_code == 422  # validation error

def test_decision_path_description():
    path = get_decision_path_description(25, 1200000, "Aggressive")
    assert "age < 30" in path
    assert "income > 10L" in path
    assert "risk = Aggressive" in path

def test_shap_efficiency_axiom():
    """
    Checks that SHAP values sum to prediction probability minus expected value within tolerance.
    """
    try:
        import joblib
        import os
        import shap
        
        model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'model', 'model.pkl')
        if not os.path.exists(model_path):
            pytest.skip("Model pkl not generated yet, skipping SHAP efficiency test")
            
        pipeline = joblib.load(model_path)
        clf = pipeline.named_steps['clf']
        scaler = pipeline.named_steps['scaler']
        
        explainer = shap.TreeExplainer(clf)
        
        # Run check on a dummy test sample matching feature_engineering output
        feat = engineer_features(
            age=30, annual_income=1200000.0, monthly_savings=40000.0,
            investment_horizon=15, liquid_savings=50000.0, existing_debt=12.0,
            dependents=2, emergency_fund_months=3.0, risk_tolerance='Moderate'
        )
        dummy_sample = to_model_array(feat)
        scaled = scaler.transform(dummy_sample)
        
        shap_vals = explainer.shap_values(scaled)
        probas = clf.predict_proba(scaled)[0]
        
        is_list = isinstance(shap_vals, list)
        
        for c_idx in range(len(probas)):
            expected_prob = probas[c_idx]
            if is_list:
                shap_sum = np.sum(shap_vals[c_idx][0])
                base_val = explainer.expected_value[c_idx]
            else:
                shap_sum = np.sum(shap_vals[0, :, c_idx])
                base_val = explainer.expected_value[c_idx]
                
            assert abs((base_val + shap_sum) - expected_prob) < 1e-4
    except ImportError:
        pytest.skip("shap library not available, skipping efficiency axiom test")
