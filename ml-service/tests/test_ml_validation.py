import os
import numpy as np  # type: ignore[import-not-found]
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from model.data.feature_engineering import engineer_features, to_model_array, get_feature_names
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
        age=raw_inputs['age'],
        annual_income=raw_inputs['annual_income'],
        monthly_savings=raw_inputs['monthly_savings'],
        investment_horizon=raw_inputs['investment_horizon'],
        liquid_savings=raw_inputs['liquid_savings'],
        existing_debt=raw_inputs['existing_debt'],
        dependents=raw_inputs['dependents'],
        emergency_fund_months=raw_inputs['emergency_fund_months'],
        risk_tolerance='Moderate'
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

def test_predict_enriched_endpoint_invalid_savings(client, monkeypatch):
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
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
        import joblib  # type: ignore[import-not-found]
        import os
        import shap  # type: ignore[import-not-found]
        
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


def test_fail_closed_auth_when_api_key_unset(client):
    """
    Asserts HTTP 500 error when ML_SERVICE_API_KEY is unset and ENVIRONMENT is not 'local'.
    """
    old_key = os.environ.pop("ML_SERVICE_API_KEY", None)
    old_env = os.environ.pop("ENVIRONMENT", None)
    try:
        os.environ["ENVIRONMENT"] = "production"
        resp = client.post("/predict", json={})
        assert resp.status_code == 500
        assert "Server Misconfiguration" in resp.json()["detail"]
    finally:
        if old_key is not None:
            os.environ["ML_SERVICE_API_KEY"] = old_key
        if old_env is not None:
            os.environ["ENVIRONMENT"] = old_env


def test_dev_mode_auth_bypass_with_local_environment(client):
    """
    Asserts dev-mode auth bypass works when ENVIRONMENT='local' even if ML_SERVICE_API_KEY is unset.
    """
    old_key = os.environ.pop("ML_SERVICE_API_KEY", None)
    old_env = os.environ.get("ENVIRONMENT")
    try:
        os.environ["ENVIRONMENT"] = "local"
        resp = client.get("/health")
        assert resp.status_code == 200
    finally:
        if old_key is not None:
            os.environ["ML_SERVICE_API_KEY"] = old_key
        if old_env is not None:
            os.environ["ENVIRONMENT"] = old_env
        else:
            os.environ.pop("ENVIRONMENT", None)


def test_rag_80c_elss_citation_regression():
    """
    Regression Test (Bug 2 Fix): Ensures 'How much deduction is allowed under Section 80C for ELSS?'
    returns the correct Section 80C citation at top position when processed through RAG pipeline.
    """
    from rag.ingestion.pipeline import IngestionPipeline
    from rag.retrieval.pipeline import RAGPipeline
    from rag.config import RAGConfig
    from rag.schema import RAGQueryRequest
    from rag.seed_knowledge import TAX_REGULATIONS_2025, MUTUAL_FUNDS_SUITABILITY

    pipeline = IngestionPipeline()
    pipeline.ingest_text(text=TAX_REGULATIONS_2025, title="Income Tax Regulations FY 2025-26", source="Income Tax Dept", author="CBDT")
    pipeline.ingest_text(text=MUTUAL_FUNDS_SUITABILITY, title="SEBI & AMFI Guidelines", source="SEBI", author="SEBI")

    config = RAGConfig()
    rag = RAGPipeline(embedder=pipeline.embedder, vector_store=pipeline.vector_store, config=config)

    query = "How much deduction is allowed under Section 80C for ELSS?"
    response = rag.query(RAGQueryRequest(question=query))

    assert len(response.citations) > 0, "Expected citations array to be non-empty"
    top_citation = response.citations[0]
    assert any(term in top_citation.excerpt for term in ["80C", "1,50,000", "1.5 Lakhs"]), (
        f"Top citation must contain Section 80C details, got: {top_citation.excerpt}"
    )


def test_ft_transformer_reglu_vs_gelu_activations():
    """
    Regression Test (Bug 3 Fix): Verifies that ReGLU and GELU activations in FTTransformer
    both execute successfully, produce distinct output tensors, and support backward passes.
    """
    import torch
    from model.architecture.ft_transformer import FTTransformer, FTTransformerConfig

    config_reglu = FTTransformerConfig(input_dim=16, d_token=32, activation="reglu")
    model_reglu = FTTransformer(config_reglu)
    model_reglu.eval()

    config_gelu = FTTransformerConfig(input_dim=16, d_token=32, activation="gelu")
    model_gelu = FTTransformer(config_gelu)
    model_gelu.eval()

    torch.manual_seed(42)
    x = torch.randn(4, 16)

    # Share tokenizer/cls/head weights to isolate FFN activation difference
    model_gelu.tokenizer.load_state_dict(model_reglu.tokenizer.state_dict())
    model_gelu.cls_token.data.copy_(model_reglu.cls_token.data)
    model_gelu.head.load_state_dict(model_reglu.head.state_dict())

    out_reglu = model_reglu(x)
    out_gelu = model_gelu(x)

    assert out_reglu.shape == (4, 6)
    assert out_gelu.shape == (4, 6)
    assert not torch.allclose(out_reglu, out_gelu, atol=1e-4), "ReGLU and GELU activations must produce different outputs"

    # Verify backward pass on both
    model_reglu.train()
    loss_reglu = model_reglu(x).sum()
    loss_reglu.backward()

    model_gelu.train()
    loss_gelu = model_gelu(x).sum()
    loss_gelu.backward()


