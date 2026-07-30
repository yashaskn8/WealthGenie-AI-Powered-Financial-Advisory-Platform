"""
WealthGenie ML Microservice - Model Evaluation & Comparison Module
Computes classification metrics, latency benchmarks, and side-by-side comparison tables.
"""

import time
from typing import Dict, Any, Tuple, Optional
import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
    classification_report,
)

from model.config import ArtifactPaths, get_device, PyTorchModelConfig
from model.model import FinancialMLP
from model.preprocessing import FeaturePreprocessor


def evaluate_pytorch_model(
    model: torch.nn.Module,
    test_loader: torch.utils.data.DataLoader,
    device: torch.device = None
) -> Dict[str, Any]:
    """
    Evaluates a PyTorch model on a DataLoader test set and computes accuracy, precision,
    recall, F1-score, confusion matrix, and average inference latency.
    """
    if device is None:
        device = get_device()

    model.eval()
    model.to(device)

    all_preds = []
    all_targets = []
    latencies = []

    with torch.no_grad():
        for inputs, targets in test_loader:
            inputs = inputs.to(device)
            start_time = time.perf_counter()
            outputs = model(inputs)
            latency_ms = (time.perf_counter() - start_time) * 1000.0 / inputs.size(0)
            latencies.append(latency_ms)

            _, preds = torch.max(outputs, 1)
            all_preds.extend(preds.cpu().numpy())
            all_targets.extend(targets.numpy())

    all_preds = np.array(all_preds)
    all_targets = np.array(all_targets)

    acc = float(accuracy_score(all_targets, all_preds))
    precision, recall, f1, _ = precision_recall_fscore_support(
        all_targets, all_preds, average="weighted", zero_division=0
    )
    conf_matrix = confusion_matrix(all_targets, all_preds).tolist()
    report = classification_report(all_targets, all_preds, output_dict=True, zero_division=0)
    avg_latency = float(np.mean(latencies))

    return {
        "model_name": "PyTorch_FinancialMLP",
        "accuracy": round(acc, 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1_score": round(float(f1), 4),
        "avg_latency_ms": round(avg_latency, 4),
        "confusion_matrix": conf_matrix,
        "classification_report": report,
    }


def compare_models(
    rf_model: Any,
    pytorch_model: torch.nn.Module,
    preprocessor: FeaturePreprocessor,
    X_test: np.ndarray,
    y_test: np.ndarray,
    device: torch.device = None
) -> Dict[str, Any]:
    """
    Performs side-by-side benchmarking of Random Forest vs. PyTorch MLP on the same test set.
    """
    if device is None:
        device = get_device()

    # ── 1. Evaluate Random Forest ──
    rf_start = time.perf_counter()
    rf_preds = rf_model.predict(X_test)
    rf_latency_ms = (time.perf_counter() - rf_start) * 1000.0 / len(X_test)

    rf_acc = float(accuracy_score(y_test, rf_preds))
    rf_prec, rf_rec, rf_f1, _ = precision_recall_fscore_support(
        y_test, rf_preds, average="weighted", zero_division=0
    )

    # ── 2. Evaluate PyTorch MLP ──
    X_test_scaled = preprocessor.transform(X_test)
    X_tensor = torch.tensor(X_test_scaled, dtype=torch.float32, device=device)

    pytorch_model.eval()
    pytorch_model.to(device)
    with torch.no_grad():
        pt_start = time.perf_counter()
        pt_logits = pytorch_model(X_tensor)
        pt_preds = torch.argmax(pt_logits, dim=1).cpu().numpy()
        pt_latency_ms = (time.perf_counter() - pt_start) * 1000.0 / len(X_test)

    pt_acc = float(accuracy_score(y_test, pt_preds))
    pt_prec, pt_rec, pt_f1, _ = precision_recall_fscore_support(
        y_test, pt_preds, average="weighted", zero_division=0
    )

    comparison = {
        "random_forest": {
            "model_type": "Scikit-Learn RandomForest",
            "accuracy": round(rf_acc, 4),
            "precision": round(float(rf_prec), 4),
            "recall": round(float(rf_rec), 4),
            "f1_score": round(float(rf_f1), 4),
            "avg_latency_per_sample_ms": round(rf_latency_ms, 4),
        },
        "pytorch_mlp": {
            "model_type": "PyTorch Multi-Layer Perceptron",
            "accuracy": round(pt_acc, 4),
            "precision": round(float(pt_prec), 4),
            "recall": round(float(pt_rec), 4),
            "f1_score": round(float(pt_f1), 4),
            "avg_latency_per_sample_ms": round(pt_latency_ms, 4),
        },
        "winner": "PyTorch_MLP" if pt_f1 >= rf_f1 else "Random_Forest",
        "performance_delta": {
            "accuracy_difference": round(pt_acc - rf_acc, 4),
            "f1_difference": round(pt_f1 - rf_f1, 4),
        }
    }

    return comparison
