"""
WealthGenie ML Microservice - FastAPI
Serves RandomForest (TreeSHAP), PyTorch MLP, and FT-Transformer predictions via a unified ModelRegistry.
"""

import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Any, List

from dotenv import load_dotenv
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader

from explainer import ModelExplainer
from feature_engineering import engineer_features, to_model_array
from model.inference import RandomForestPredictor, MLPPredictor, FTTransformerPredictor
from model.registry import registry
from schemas import HealthResponse, PredictRequest, PredictResponse

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("wealthgenie.ml")

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    expected_key = os.environ.get("ML_SERVICE_API_KEY", "")
    if not expected_key:
        return api_key or "dev-mode"
    if not api_key or not hmac.compare_digest(api_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key"
        )
    return api_key


# ── Application State & Lifespan ─────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"

model = None
label_encoder = None
model_accuracy: float | None = None
confidence_threshold: float = 0.55
git_commit_hash: str = "ffa37ba"
model_version: str = "3.0.0"
dataset_version: str = "3.0.0"
explainer_instance: ModelExplainer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, label_encoder, model_accuracy, confidence_threshold, git_commit_hash, model_version, dataset_version, explainer_instance
    
    # 1. Instantiate & Register Predictors in ModelRegistry
    rf_pred = RandomForestPredictor()
    rf_pred.load_artifacts()
    model = rf_pred.model
    label_encoder = rf_pred.label_encoder
    registry.register("random_forest", rf_pred)
    registry.register("rf", rf_pred)

    mlp_pred = MLPPredictor()
    mlp_pred.load_artifacts()
    if not mlp_pred.is_loaded:
        logger.info("Auto-training baseline PyTorch MLP model...")
        from model.train_pytorch import train_pytorch_model
        train_pytorch_model()
        mlp_pred.load_artifacts()
    registry.register("mlp", mlp_pred)
    registry.register("pytorch", mlp_pred)

    ft_pred = FTTransformerPredictor()
    ft_pred.load_artifacts()
    if not ft_pred.is_loaded:
        logger.info("Auto-training baseline FT-Transformer model...")
        from model.train_pytorch import train_ft_transformer_model
        train_ft_transformer_model()
        ft_pred.load_artifacts()
    registry.register("ft_transformer", ft_pred)

    # 2. Load TreeSHAP Explainer from RF model
    if rf_pred.is_loaded and rf_pred.model is not None and rf_pred.label_encoder is not None:
        try:
            explainer_instance = ModelExplainer(rf_pred.model, rf_pred.label_encoder)
            logger.info("TreeSHAP Explainer initialized successfully.")
        except Exception as e:
            logger.warning(f"TreeSHAP Explainer initialization failed ({e}); serving without SHAP attributions.")

    # 5. Initialize & Seed RAG Knowledge Base
    try:
        from rag.seed_knowledge import seed_default_knowledge_base
        seed_default_knowledge_base()
        logger.info("RAG Knowledge Base initialized & seeded successfully.")
    except Exception as e:
        logger.warning(f"RAG Knowledge Base initialization failed: {e}")

    logger.info(f"ModelRegistry initialized with registered models: {[m['key'] for m in registry.list_models()]}")
    yield


app = FastAPI(
    title="WealthGenie ML & RAG Platform",
    version="4.0.0",
    lifespan=lifespan
)

from fastapi import Depends, FastAPI, HTTPException, Request, Response, Security, status

from rag.router import rag_router
from llm.router import llm_router
app.include_router(rag_router)
app.include_router(llm_router)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

cors_origins_env = os.environ.get("CORS_ORIGINS")
origins = cors_origins_env.split(",") if cors_origins_env else ["http://localhost:5000", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def get_decision_path_description(age: int, income: float, risk_category: str) -> list[str]:
    path = []
    if age < 30:
        path.append("age < 30")
    elif age <= 45:
        path.append("30 <= age <= 45")
    else:
        path.append("age > 45")

    if income > 1500000:
        path.append("income > 15L")
    elif income > 1000000:
        path.append("income > 10L")
    elif income > 600000:
        path.append("income > 6L")
    else:
        path.append("income <= 6L")

    path.append(f"risk = {risk_category}")
    return path


@app.get("/health", response_model=HealthResponse)
def health():
    rf = registry.get("random_forest")
    status_str = "ok" if (rf and rf.is_loaded) else "model_not_loaded"
    return HealthResponse(
        status=status_str,
        model_version=model_version,
        model_accuracy=model_accuracy,
        explainer_loaded=explainer_instance is not None,
    )


@app.get("/readiness")
def readiness():
    """Readiness probe checking ModelRegistry status."""
    loaded_models = registry.get_loaded_predictors()
    return {
        "status": "ready" if loaded_models else "not_ready",
        "loaded_models_count": len(loaded_models),
        "available_models": list(loaded_models.keys()),
    }


@app.get("/models")
def list_registered_models():
    """Lists metadata for all registered models in the registry."""
    return {"registered_models": registry.list_models()}


@app.post("/predict/enriched", response_model=PredictResponse, dependencies=[Depends(verify_api_key)])
@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(verify_api_key)])
async def predict_enriched(data: PredictRequest):
    """
    Prediction endpoint serving recommendations using Random Forest + TreeSHAP explainability.
    """
    features = engineer_features(
        age=data.age, annual_income=data.annual_income, monthly_savings=data.monthly_savings,
        investment_horizon=data.investment_horizon, liquid_savings=data.liquid_savings,
        existing_debt=data.existing_debt, dependents=data.dependents,
        emergency_fund_months=data.emergency_fund_months, risk_tolerance=data.risk_tolerance
    )
    model_input = to_model_array(features)

    predictor = registry.get("random_forest")
    if predictor is None or not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="RandomForest model not loaded.")

    res = predictor.predict(model_input)
    explanation = None
    if explainer_instance is not None:
        try:
            explanation = explainer_instance.explain(model_input)
        except Exception as e:
            logger.warning(f"TreeSHAP explanation failed: {e}")

    return PredictResponse(
        primary=res["primary"],
        secondary=res["secondary"],
        tertiary=res["tertiary"],
        confidence_scores=res["confidence_scores"],
        decision_path=get_decision_path_description(data.age, data.annual_income, data.risk_category),
        model_used="RandomForest",
        low_confidence=res["low_confidence"],
        confidence_threshold=confidence_threshold,
        model_version=model_version,
        dataset_version=dataset_version,
        git_commit_hash=git_commit_hash,
        explanation=explanation,
    )


@app.post("/predict/pytorch", response_model=PredictResponse, dependencies=[Depends(verify_api_key)])
async def predict_pytorch(data: PredictRequest):
    """
    Prediction endpoint serving recommendations from the PyTorch Multi-Layer Perceptron (MLP).
    """
    predictor = registry.get("mlp")
    if predictor is None or not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="PyTorch MLP model not loaded.")

    features = engineer_features(
        age=data.age, annual_income=data.annual_income, monthly_savings=data.monthly_savings,
        investment_horizon=data.investment_horizon, liquid_savings=data.liquid_savings,
        existing_debt=data.existing_debt, dependents=data.dependents,
        emergency_fund_months=data.emergency_fund_months, risk_tolerance=data.risk_tolerance
    )
    model_input = to_model_array(features)
    res = predictor.predict(model_input)

    return PredictResponse(
        primary=res["primary"],
        secondary=res["secondary"],
        tertiary=res["tertiary"],
        confidence_scores=res["confidence_scores"],
        decision_path=get_decision_path_description(data.age, data.annual_income, data.risk_category),
        model_used="PyTorch_FinancialMLP",
        low_confidence=res["low_confidence"],
        confidence_threshold=0.45,
        model_version="1.0.0-pytorch",
        dataset_version=dataset_version,
        git_commit_hash=git_commit_hash,
        explanation=None,
    )


@app.post("/predict/ft_transformer", response_model=PredictResponse, dependencies=[Depends(verify_api_key)])
async def predict_ft_transformer(data: PredictRequest):
    """
    Prediction endpoint serving recommendations from the PyTorch FT-Transformer model.
    """
    predictor = registry.get("ft_transformer")
    if predictor is None or not predictor.is_loaded:
        raise HTTPException(status_code=503, detail="FT-Transformer model not loaded.")

    features = engineer_features(
        age=data.age, annual_income=data.annual_income, monthly_savings=data.monthly_savings,
        investment_horizon=data.investment_horizon, liquid_savings=data.liquid_savings,
        existing_debt=data.existing_debt, dependents=data.dependents,
        emergency_fund_months=data.emergency_fund_months, risk_tolerance=data.risk_tolerance
    )
    model_input = to_model_array(features)
    res = predictor.predict(model_input)

    return PredictResponse(
        primary=res["primary"],
        secondary=res["secondary"],
        tertiary=res["tertiary"],
        confidence_scores=res["confidence_scores"],
        decision_path=get_decision_path_description(data.age, data.annual_income, data.risk_category),
        model_used="PyTorch_FTTransformer",
        low_confidence=res["low_confidence"],
        confidence_threshold=0.45,
        model_version="1.0.0-ft_transformer",
        dataset_version=dataset_version,
        git_commit_hash=git_commit_hash,
        explanation=None,
    )


@app.post("/predict/compare", dependencies=[Depends(verify_api_key)])
async def predict_compare(data: PredictRequest):
    """
    Multi-model inference comparison endpoint running predictions across all loaded models in ModelRegistry.
    """
    features = engineer_features(
        age=data.age, annual_income=data.annual_income, monthly_savings=data.monthly_savings,
        investment_horizon=data.investment_horizon, liquid_savings=data.liquid_savings,
        existing_debt=data.existing_debt, dependents=data.dependents,
        emergency_fund_months=data.emergency_fund_months, risk_tolerance=data.risk_tolerance
    )
    model_input = to_model_array(features)

    loaded_models = registry.get_loaded_predictors()
    if not loaded_models:
        raise HTTPException(status_code=503, detail="No models loaded in registry.")

    comparison_results = {}
    primary_predictions = []

    for name, pred in loaded_models.items():
        if name in ["rf", "pytorch"]:
            continue  # Skip redundant alias keys in comparison output
        res = pred.predict(model_input)
        comparison_results[name] = {
            "model_name": pred.model_name,
            "primary": res["primary"],
            "secondary": res["secondary"],
            "confidence_scores": res["confidence_scores"],
            "latency_ms": res["latency_ms"],
        }
        primary_predictions.append(res["primary"])

    consensus = len(set(primary_predictions)) == 1

    return {
        "comparison": comparison_results,
        "primary_consensus": consensus,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
