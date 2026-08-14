"""
WealthGenie ML Microservice - FastAPI
Serves RandomForest (TreeSHAP), PyTorch MLP, and FT-Transformer predictions via a unified ModelRegistry.
Integrated with persistent MongoModelRegistry / SQLite ModelRegistry via store_factory.
"""

import hmac
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Any, List, Optional

from dotenv import load_dotenv
import numpy as np  # type: ignore[import-not-found]
from fastapi import Depends, FastAPI, HTTPException, Request, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader

from model.evaluation.explainer import ModelExplainer
from model.data.feature_engineering import engineer_features, to_model_array
from model.serving.inference import RandomForestPredictor, MLPPredictor, FTTransformerPredictor
from model.serving.registry import registry
from store_factory import get_model_registry
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
    """Authenticate requests via constant-time API key comparison.

    Uses hmac.compare_digest for timing-attack-resistant string equality
    checks against the ML_SERVICE_API_KEY environment variable.
    """
    expected_key = os.environ.get("ML_SERVICE_API_KEY", "")
    env_mode = os.environ.get("ENVIRONMENT", "").lower()

    if not expected_key:
        if env_mode == "local":
            return api_key or "dev-mode"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server Misconfiguration: ML_SERVICE_API_KEY is not set. Set ENVIRONMENT=local to permit dev-mode bypass."
        )
    if not api_key or not hmac.compare_digest(api_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key"
        )
    return api_key


# Application State & Lifespan
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


def _seed_and_resolve_active_models(version_registry) -> None:
    """
    Seeds baseline models into the persistent version registry if empty or paths invalid,
    ensuring tamper-evident lineage is maintained across restarts and replicas.
    """
    data_dir = BASE_DIR / "data"
    profiles_csv = data_dir / "investment_profiles.csv"
    data_hash = "unavailable"
    if profiles_csv.exists():
        try:
            from model.registry.registry_store import compute_data_hash
            data_hash = compute_data_hash(profiles_csv)
        except Exception:
            pass

    ref_dist = None
    if profiles_csv.exists():
        try:
            import pandas as pd
            from model.registry.drift_detection import compute_reference_distributions
            df = pd.read_csv(profiles_csv)
            feature_cols = [
                "age", "annual_income", "monthly_savings", "investment_horizon",
                "liquid_savings", "existing_debt", "dependents", "emergency_fund_months",
                "risk_score", "stated_tolerance_score", "savings_rate",
                "debt_to_income_ratio", "emergency_fund_adequacy_ratio",
                "risk_capacity_vs_stated_tolerance_gap", "horizon_adjusted_urgency_score",
                "dependents_adjusted_burden_score",
            ]
            ref_dist = compute_reference_distributions(df, feature_cols)
        except Exception:
            pass

    # 1. Seed RandomForest if not already registered or artifact path not existing
    rf_artifact = MODEL_DIR / "model.pkl"
    if rf_artifact.exists():
        active_rf = version_registry.get_active_model("RandomForest")
        if active_rf is None or not Path(active_rf["artifact_path"]).exists():
            meta = {}
            metadata_path = MODEL_DIR / "metadata.json"
            if metadata_path.exists():
                try:
                    with open(metadata_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    pass

            fidelity = meta.get("test_accuracy", 0.9553)
            training_timestamp = meta.get("trained_at", "2026-07-23T19:28:42Z")
            hparams = {"n_estimators": 100, "max_depth": 12, "model_type": "RandomForestClassifier"}
            metrics = {
                "rule_approximation_fidelity": fidelity,
                "independent_cfp_benchmark_accuracy": 0.2526,
                "balanced_accuracy": meta.get("balanced_accuracy", 0.858),
                "macro_f1": meta.get("macro_f1", 0.8601),
            }
            try:
                vid = version_registry.register_model(
                    model_architecture="RandomForest",
                    artifact_path=rf_artifact,
                    training_data_hash=data_hash,
                    training_timestamp=training_timestamp,
                    hyperparameters=hparams,
                    metrics=metrics,
                    reference_distributions=ref_dist,
                    notes="Baseline RandomForest model seeded at application startup",
                    set_active=True,
                )
                logger.info(f"Seeded active RandomForest baseline version {vid} in ModelRegistry.")
            except Exception as e:
                logger.warning(f"Failed to seed RandomForest baseline version: {e}")

    # 2. Seed PyTorch MLP if not already registered
    mlp_artifact = MODEL_DIR / "saved_models" / "mlp_model.pt"
    if mlp_artifact.exists():
        active_mlp = version_registry.get_active_model("PyTorch_MLP")
        if active_mlp is None or not Path(active_mlp["artifact_path"]).exists():
            try:
                vid = version_registry.register_model(
                    model_architecture="PyTorch_MLP",
                    artifact_path=mlp_artifact,
                    training_data_hash=data_hash,
                    training_timestamp="2026-07-30T15:57:00Z",
                    hyperparameters={"input_dim": 16, "hidden_dims": [64, 32], "output_dim": 6},
                    metrics={"rule_approximation_fidelity": 0.9560, "independent_cfp_benchmark_accuracy": 0.1750},
                    notes="Baseline PyTorch MLP model seeded at application startup",
                    set_active=True,
                )
                logger.info(f"Seeded active PyTorch MLP baseline version {vid} in ModelRegistry.")
            except Exception as e:
                logger.warning(f"Failed to seed PyTorch MLP baseline: {e}")

    # 3. Seed FT-Transformer if not already registered
    ft_artifact = MODEL_DIR / "saved_models" / "ft_transformer.pt"
    if ft_artifact.exists():
        active_ft = version_registry.get_active_model("FT_Transformer")
        if active_ft is None or not Path(active_ft["artifact_path"]).exists():
            try:
                vid = version_registry.register_model(
                    model_architecture="FT_Transformer",
                    artifact_path=ft_artifact,
                    training_data_hash=data_hash,
                    training_timestamp="2026-07-30T16:05:00Z",
                    hyperparameters={"d_token": 64, "n_blocks": 3, "n_heads": 4},
                    metrics={"rule_approximation_fidelity": 0.9705, "independent_cfp_benchmark_accuracy": 0.1583},
                    notes="Baseline FT-Transformer model seeded at application startup",
                    set_active=True,
                )
                logger.info(f"Seeded active FT-Transformer baseline version {vid} in ModelRegistry.")
            except Exception as e:
                logger.warning(f"Failed to seed FT-Transformer baseline: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, label_encoder, model_accuracy, confidence_threshold, git_commit_hash, model_version, dataset_version, explainer_instance
    
    # 0. Instantiate Version Registry via Store Factory & attach to serving ModelRegistry
    version_registry = get_model_registry()
    registry.set_version_registry(version_registry)
    app.state.version_registry = version_registry

    # 1. Seed & Resolve Active Model Versions from Persistent Registry
    _seed_and_resolve_active_models(version_registry)

    # 2. Instantiate & Register Predictors in ModelRegistry from Active Versions
    rf_pred = RandomForestPredictor()
    active_rf = version_registry.get_active_model("RandomForest")
    if active_rf and Path(active_rf["artifact_path"]).exists():
        rf_pred.load_artifacts(artifact_path=Path(active_rf["artifact_path"]))
        model_version = active_rf["version_id"]
        model_accuracy = active_rf.get("metrics", {}).get("rule_approximation_fidelity", 0.9553)
    else:
        rf_pred.load_artifacts()

    model = rf_pred.model
    label_encoder = rf_pred.label_encoder
    registry.register("random_forest", rf_pred)
    registry.register("rf", rf_pred)

    mlp_pred = MLPPredictor()
    active_mlp = version_registry.get_active_model("PyTorch_MLP")
    if active_mlp and Path(active_mlp["artifact_path"]).exists():
        mlp_pred.load_artifacts(artifact_path=Path(active_mlp["artifact_path"]))
    else:
        mlp_pred.load_artifacts()

    if not mlp_pred.is_loaded:
        logger.info("Auto-training baseline PyTorch MLP model...")
        from model.training.train_pytorch import train_pytorch_model
        train_pytorch_model()
        mlp_pred.load_artifacts()
    registry.register("mlp", mlp_pred)
    registry.register("pytorch", mlp_pred)

    ft_pred = FTTransformerPredictor()
    active_ft = version_registry.get_active_model("FT_Transformer")
    if active_ft and Path(active_ft["artifact_path"]).exists():
        ft_pred.load_artifacts(artifact_path=Path(active_ft["artifact_path"]))
    else:
        ft_pred.load_artifacts()

    if not ft_pred.is_loaded:
        logger.info("Auto-training baseline FT-Transformer model...")
        from model.training.train_pytorch import train_ft_transformer_model
        train_ft_transformer_model()
        ft_pred.load_artifacts()
    registry.register("ft_transformer", ft_pred)

    # 3. Load TreeSHAP Explainer from RF model
    if rf_pred.is_loaded and rf_pred.model is not None and rf_pred.label_encoder is not None:
        try:
            explainer_instance = ModelExplainer(rf_pred.model, rf_pred.label_encoder)
            logger.info("TreeSHAP Explainer initialized successfully.")
        except Exception as e:
            logger.warning(f"TreeSHAP Explainer initialization failed ({e}); serving without SHAP attributions.")

    # 4. Initialize & Seed RAG Knowledge Base
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

# Include Subsystem Routers
from rag.router import rag_router
from llm.router import llm_router
from model.registry.router import registry_router

app.include_router(rag_router)
app.include_router(llm_router)
app.include_router(registry_router)


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    cid = request.headers.get("x-correlation-id") or request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.correlation_id = cid
    response = await call_next(request)
    response.headers["x-correlation-id"] = cid
    return response


# CORS Configuration
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    os.environ.get("FRONTEND_URL", "http://localhost:5173"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_decision_path_description(age: int, income: float, risk_category: str) -> List[str]:
    """Generates human-readable decision steps explaining model routing logic."""
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


@app.get("/healthz")
def healthz():
    return {"status": "alive"}

@app.get("/readyz")
def readyz():
    return readiness()

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
    import uvicorn  # type: ignore[import-not-found]
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
