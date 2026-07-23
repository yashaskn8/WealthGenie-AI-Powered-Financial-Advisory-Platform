"""
WealthGenie ML Microservice - FastAPI
Serves RandomForest predictions trained on historical NAV statistics with TreeSHAP feature attributions on port 8000.
"""

import hmac
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
import joblib
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader

from explainer import ModelExplainer
from feature_engineering import engineer_features, to_model_array
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


# ── Application State ─────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "model"
MODEL_PATH = Path(os.environ.get("MODEL_PATH", MODEL_DIR / "model.pkl"))
LE_PATH = MODEL_DIR / "label_encoder.pkl"

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
    try:
        model = joblib.load(MODEL_PATH)
        label_encoder = joblib.load(LE_PATH)
        logger.info(f"RandomForest model loaded successfully from {MODEL_PATH}")
    except FileNotFoundError:
        logger.warning(f"Model file not found at {MODEL_PATH}. Run 'python model/train.py' first.")
    except Exception as e:
        logger.error(f"Error loading model from {MODEL_PATH}: {e}")

    # Load metadata
    metadata_path = MODEL_DIR / "metadata.json"
    try:
        if metadata_path.exists():
            with metadata_path.open("r", encoding="utf-8") as f:
                metadata = json.load(f)
            model_accuracy = metadata.get("test_accuracy", metadata.get("rf_accuracy"))
            confidence_threshold = float(metadata.get("confidence_threshold", 0.55))
            git_commit_hash = metadata.get("git_commit_hash", "ffa37ba")
            model_version = metadata.get("model_version", "3.0.0")
            dataset_version = metadata.get("dataset_version", "3.0.0")
            logger.info(f"Model metadata loaded: accuracy={model_accuracy}, confidence_threshold={confidence_threshold}")
        else:
            logger.warning(f"Metadata file not found at {metadata_path}")
    except Exception as e:
        logger.warning(f"Failed to parse metadata.json at {metadata_path}: {e}")

    if model is not None and label_encoder is not None:
        try:
            explainer_instance = ModelExplainer(model, label_encoder)
            logger.info("TreeSHAP Explainer initialized successfully from preloaded model")
        except Exception as e:
            logger.warning(f"TreeSHAP Explainer initialization failed ({e}); serving without SHAP attributions.")
            explainer_instance = None

    yield


app = FastAPI(
    title="WealthGenie ML Service",
    version="3.0.0",
    lifespan=lifespan
)

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
    status_str = "ok" if model is not None else "model_not_loaded"
    return HealthResponse(
        status=status_str,
        model_version=model_version,
        model_accuracy=model_accuracy,
        explainer_loaded=explainer_instance is not None,
    )


@app.post("/predict/enriched", response_model=PredictResponse, dependencies=[Depends(verify_api_key)])
async def predict_enriched(data: PredictRequest):
    """
    Prediction endpoint serving recommendations from a classifier trained on historical NAV statistics.
    Includes low_confidence flag and TreeSHAP feature attributions.
    """
    features = engineer_features(
        age=data.age,
        annual_income=data.annual_income,
        monthly_savings=data.monthly_savings,
        investment_horizon=data.investment_horizon,
        liquid_savings=data.liquid_savings,
        existing_debt=data.existing_debt,
        dependents=data.dependents,
        emergency_fund_months=data.emergency_fund_months,
        risk_tolerance=data.risk_tolerance
    )
    model_input = to_model_array(features)

    if model is None or label_encoder is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run train.py first.")

    proba = model.predict_proba(model_input)[0]
    ranked = np.argsort(proba)[::-1]
    max_prob = float(proba[ranked[0]])

    # Confidence check
    is_low_confidence = bool(max_prob < confidence_threshold)

    explanation = None
    if explainer_instance is not None:
        try:
            explanation = explainer_instance.explain(model_input)
        except Exception as e:
            logger.warning(f"TreeSHAP explanation generation failed for request: {e}")

    # Fallback secondary/tertiary if classes count is small
    n_classes = len(label_encoder.classes_)
    primary_cls = str(label_encoder.classes_[ranked[0]])
    secondary_cls = str(label_encoder.classes_[ranked[1]]) if n_classes > 1 else primary_cls
    tertiary_cls = str(label_encoder.classes_[ranked[2]]) if n_classes > 2 else secondary_cls

    return PredictResponse(
        primary=primary_cls,
        secondary=secondary_cls,
        tertiary=tertiary_cls,
        confidence_scores={
            cls: round(float(p), 4)
            for cls, p in zip(label_encoder.classes_, proba)
        },
        decision_path=get_decision_path_description(data.age, data.annual_income, data.risk_category),
        model_used="RandomForest",
        low_confidence=is_low_confidence,
        confidence_threshold=confidence_threshold,
        model_version=model_version,
        dataset_version=dataset_version,
        git_commit_hash=git_commit_hash,
        explanation=explanation,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

