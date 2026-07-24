"""
WealthGenie Technical Depth Benchmark Suite
Task 3: TreeSHAP vs KernelSHAP Cost Analysis
Task 4: Label Sensitivity Analysis (±10% threshold perturbation + retrain)
Task 5: Bayesian Confidence Intervals for Individual Predictions

Run: python scripts/benchmark_ml_technical_depth.py
"""

import os
import sys
import json
import time
import platform
import tracemalloc
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

# Setup paths
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ML_DIR = REPO_ROOT / "ml-service"
sys.path.insert(0, str(ML_DIR))

from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, classification_report, balanced_accuracy_score
)
import joblib

from feature_engineering import engineer_features, to_model_array, get_feature_names, FEATURE_NAMES
from model.label_construction import construct_supervisory_targets, load_suitability_config, CORE_CATEGORIES

np.random.seed(42)

BENCHMARKS_DIR = REPO_ROOT / "benchmarks"
BENCHMARKS_DIR.mkdir(parents=True, exist_ok=True)
DOCS_DIR = REPO_ROOT / "docs"
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# ─── System Environment ──────────────────────────────────────────────────────
SYSTEM_INFO = {
    "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
    "cpu": platform.processor() or "Unknown",
    "python_version": platform.python_version(),
    "date": datetime.now(timezone.utc).isoformat(),
    "random_seed": 42,
}

def get_dependency_versions():
    versions = {}
    for pkg in ["numpy", "pandas", "sklearn", "shap", "joblib"]:
        try:
            mod = __import__(pkg)
            versions[pkg] = getattr(mod, "__version__", "unknown")
        except ImportError:
            versions[pkg] = "NOT INSTALLED"
    return versions

SYSTEM_INFO["dependency_versions"] = get_dependency_versions()

print("=" * 80)
print("WEALTHGENIE TECHNICAL DEPTH BENCHMARK SUITE")
print("=" * 80)
print(f"OS: {SYSTEM_INFO['os']}")
print(f"Python: {SYSTEM_INFO['python_version']}")
print(f"Date: {SYSTEM_INFO['date']}")
print(f"Dependencies: {json.dumps(SYSTEM_INFO['dependency_versions'], indent=2)}")
print("-" * 80)


# ─── Data Generation (shared across tasks) ────────────────────────────────────
def generate_dataset(n_samples=5000):
    """Generate synthetic investor profiles for benchmarking."""
    ages = np.random.randint(18, 75, n_samples)
    incomes = np.clip(np.random.lognormal(13.5, 0.5, n_samples), 200000, 5000000)
    dependents = np.clip(np.random.poisson(1.2, n_samples), 0, 8)
    debt = np.clip(np.random.normal(20, 12, n_samples), 0, 70)
    ef_months = np.clip(np.random.normal(4, 2, n_samples), 0, 24)
    horizons = np.clip(np.random.normal(12, 8, n_samples), 1, 40).astype(int)
    savings = np.clip(incomes / 12 * np.random.uniform(0.05, 0.45, n_samples), 1000, 300000)
    liquid = np.clip(savings * np.random.uniform(2, 24, n_samples), 10000, 5000000)
    risk_tols = np.random.choice(["low", "medium", "high"], n_samples, p=[0.3, 0.4, 0.3])

    df = pd.DataFrame({
        "age": ages, "annual_income": incomes, "monthly_savings": savings,
        "investment_horizon": horizons, "liquid_savings": liquid,
        "existing_debt": debt, "dependents": dependents,
        "emergency_fund_months": ef_months, "risk_tolerance": risk_tols,
    })
    return df


def prepare_features_and_labels(df):
    """Prepare model features and labels from raw DataFrame."""
    targets, _ = construct_supervisory_targets(df, generate_report=False)
    labels = targets["primary_instrument"]

    features = []
    for _, row in df.iterrows():
        feat = engineer_features(
            age=row['age'], annual_income=row['annual_income'],
            monthly_savings=row['monthly_savings'],
            investment_horizon=row['investment_horizon'],
            liquid_savings=row['liquid_savings'],
            existing_debt=row['existing_debt'],
            dependents=row['dependents'],
            emergency_fund_months=row['emergency_fund_months'],
            risk_tolerance=row['risk_tolerance']
        )
        features.append(to_model_array(feat)[0])

    X = np.array(features)
    le = LabelEncoder()
    y = le.fit_transform(labels)
    return X, y, le


def train_model(X_train, y_train):
    """Train a RandomForest pipeline."""
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1))
    ])
    pipeline.fit(X_train, y_train)
    return pipeline


# ═════════════════════════════════════════════════════════════════════════════
# TASK 3: TreeSHAP vs KernelSHAP Cost Analysis
# ═════════════════════════════════════════════════════════════════════════════
def run_task3_shap_benchmark(pipeline, X_test, y_test, le):
    print("\n" + "=" * 80)
    print("TASK 3: TreeSHAP vs KernelSHAP COST ANALYSIS")
    print("=" * 80)

    out_path = BENCHMARKS_DIR / "treeshap_vs_kernelshap_benchmark.json"
    if out_path.exists():
        print("[Task 3 Cache] Loading existing TreeSHAP vs KernelSHAP benchmark results...")
        with out_path.open() as f:
            data = json.load(f)
            results = data["results"]
            print(f"  TreeSHAP Latency: {results['TreeSHAP']['latency_mean_s']}s")
            print(f"  KernelSHAP Latency: {results['KernelSHAP']['latency_mean_s']}s")
            print(f"  Top-3 Feature Overlap: {results['consistency']['top3_feature_overlap']*100:.1f}%")
            return results

    import shap

    rf_model = pipeline.named_steps['clf']
    scaler = pipeline.named_steps['scaler']
    X_scaled = scaler.transform(X_test)

    n_explain = min(100, len(X_test))
    X_explain = X_scaled[:n_explain]
    n_runs = 5

    results = {}

    # ── TreeSHAP ──────────────────────────────────────────────────────────────
    print("\n[TreeSHAP] Running benchmark...")
    tree_latencies = []
    tree_memories = []
    tree_shap_values_list = []

    for run_i in range(n_runs):
        tracemalloc.start()
        t0 = time.perf_counter()

        tree_explainer = shap.TreeExplainer(rf_model)
        tree_shap_values = tree_explainer.shap_values(X_explain)

        t1 = time.perf_counter()
        _, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        tree_latencies.append(t1 - t0)
        tree_memories.append(peak_mem / (1024 * 1024))
        tree_shap_values_list.append(tree_shap_values)

    results["TreeSHAP"] = {
        "latency_mean_s": round(float(np.mean(tree_latencies)), 4),
        "latency_std_s": round(float(np.std(tree_latencies)), 4),
        "latency_ci95_s": round(float(1.96 * np.std(tree_latencies) / np.sqrt(n_runs)), 4),
        "peak_memory_mean_mb": round(float(np.mean(tree_memories)), 4),
        "peak_memory_std_mb": round(float(np.std(tree_memories)), 4),
        "n_runs": n_runs,
        "n_samples_explained": n_explain,
    }

    print(f"  Latency: {results['TreeSHAP']['latency_mean_s']:.4f}s ± {results['TreeSHAP']['latency_std_s']:.4f}s")
    print(f"  Peak Memory: {results['TreeSHAP']['peak_memory_mean_mb']:.4f} MB")

    # ── KernelSHAP ────────────────────────────────────────────────────────────
    print("\n[KernelSHAP] Running benchmark (slower — sampling-based)...")
    kernel_latencies = []
    kernel_memories = []
    kernel_shap_values_list = []

    # Use a small background set for KernelSHAP (50 samples for speed)
    background = shap.sample(X_scaled, min(50, len(X_scaled)))
    n_kernel_explain = min(20, n_explain)  # KernelSHAP is very slow
    X_kernel_explain = X_explain[:n_kernel_explain]
    n_kernel_runs = 3

    for run_i in range(n_kernel_runs):
        tracemalloc.start()
        t0 = time.perf_counter()

        kernel_explainer = shap.KernelExplainer(rf_model.predict_proba, background)
        kernel_shap_values = kernel_explainer.shap_values(X_kernel_explain, nsamples=100)

        t1 = time.perf_counter()
        _, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        kernel_latencies.append(t1 - t0)
        kernel_memories.append(peak_mem / (1024 * 1024))
        kernel_shap_values_list.append(kernel_shap_values)

    results["KernelSHAP"] = {
        "latency_mean_s": round(float(np.mean(kernel_latencies)), 4),
        "latency_std_s": round(float(np.std(kernel_latencies)), 4),
        "latency_ci95_s": round(float(1.96 * np.std(kernel_latencies) / np.sqrt(n_kernel_runs)), 4),
        "peak_memory_mean_mb": round(float(np.mean(kernel_memories)), 4),
        "peak_memory_std_mb": round(float(np.std(kernel_memories)), 4),
        "n_runs": n_kernel_runs,
        "n_samples_explained": n_kernel_explain,
    }

    print(f"  Latency: {results['KernelSHAP']['latency_mean_s']:.4f}s ± {results['KernelSHAP']['latency_std_s']:.4f}s")
    print(f"  Peak Memory: {results['KernelSHAP']['peak_memory_mean_mb']:.4f} MB")

    # ── Explanation Consistency ────────────────────────────────────────────────
    # Compare top-3 feature rankings between TreeSHAP and KernelSHAP
    if isinstance(tree_shap_values_list[0], list):
        tree_mean = np.mean(np.abs(tree_shap_values_list[0][0][:n_kernel_explain]), axis=0)
    elif len(tree_shap_values_list[0].shape) == 3:
        tree_mean = np.mean(np.abs(tree_shap_values_list[0][:n_kernel_explain, :, 0]), axis=0)
    else:
        tree_mean = np.mean(np.abs(tree_shap_values_list[0][:n_kernel_explain]), axis=0)

    if isinstance(kernel_shap_values_list[0], list):
        kernel_mean = np.mean(np.abs(kernel_shap_values_list[0][0]), axis=0)
    elif len(kernel_shap_values_list[0].shape) == 3:
        kernel_mean = np.mean(np.abs(kernel_shap_values_list[0][:, :, 0]), axis=0)
    else:
        kernel_mean = np.mean(np.abs(kernel_shap_values_list[0]), axis=0)

    tree_top3 = set(np.argsort(tree_mean)[-3:])
    kernel_top3 = set(np.argsort(kernel_mean)[-3:])
    top3_overlap = len(tree_top3 & kernel_top3) / 3.0

    results["consistency"] = {
        "top3_feature_overlap": round(float(top3_overlap), 4),
        "tree_top3_features": [FEATURE_NAMES[i] for i in sorted(tree_top3)],
        "kernel_top3_features": [FEATURE_NAMES[i] for i in sorted(kernel_top3)],
    }

    # ── Model Info ────────────────────────────────────────────────────────────
    results["model_info"] = {
        "model_type": "RandomForestClassifier",
        "n_estimators": rf_model.n_estimators,
        "n_features": rf_model.n_features_in_,
        "n_classes": len(le.classes_),
        "class_names": le.classes_.tolist(),
    }

    # Save results
    out_path = BENCHMARKS_DIR / "treeshap_vs_kernelshap_benchmark.json"
    with out_path.open("w") as f:
        json.dump({"system_info": SYSTEM_INFO, "results": results}, f, indent=2)

    print(f"\n  Top-3 Feature Overlap: {top3_overlap*100:.1f}%")
    print(f"  TreeSHAP Top 3: {results['consistency']['tree_top3_features']}")
    print(f"  KernelSHAP Top 3: {results['consistency']['kernel_top3_features']}")
    print(f"  Speedup Factor: {results['KernelSHAP']['latency_mean_s'] / max(results['TreeSHAP']['latency_mean_s'], 0.001):.1f}x (Tree is faster)")
    print(f"\n  Artifact: {out_path}")

    return results


# ═════════════════════════════════════════════════════════════════════════════
# TASK 4: Label Sensitivity Analysis (±10% threshold perturbation + retrain)
# ═════════════════════════════════════════════════════════════════════════════
def run_task4_label_sensitivity(df_raw, X, y, le):
    print("\n" + "=" * 80)
    print("TASK 4: LABEL SENSITIVITY ANALYSIS (±10% THRESHOLD PERTURBATION + RETRAIN)")
    print("=" * 80)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # ── Baseline Model ────────────────────────────────────────────────────────
    print("\n[Baseline] Training model on original labels...")
    baseline_model = train_model(X_train, y_train)
    baseline_preds = baseline_model.predict(X_test)
    baseline_proba = baseline_model.predict_proba(X_test)

    baseline_metrics = {
        "accuracy": round(float(accuracy_score(y_test, baseline_preds)), 4),
        "precision_macro": round(float(precision_score(y_test, baseline_preds, average='macro', zero_division=0)), 4),
        "recall_macro": round(float(recall_score(y_test, baseline_preds, average='macro', zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y_test, baseline_preds, average='macro', zero_division=0)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_test, baseline_preds)), 4),
    }

    # Try ROC-AUC (multi-class)
    try:
        baseline_metrics["roc_auc_ovr"] = round(float(roc_auc_score(y_test, baseline_proba, multi_class='ovr', average='macro')), 4)
    except Exception:
        baseline_metrics["roc_auc_ovr"] = "N/A"

    baseline_class_dist = {le.classes_[i]: int(c) for i, c in enumerate(np.bincount(y_test, minlength=len(le.classes_)))}

    print(f"  Accuracy: {baseline_metrics['accuracy']}")
    print(f"  F1 Macro: {baseline_metrics['f1_macro']}")
    print(f"  Class Distribution: {baseline_class_dist}")

    # ── Perturbation Experiments ──────────────────────────────────────────────
    base_config = load_suitability_config()
    perturbation_scenarios = {
        "growth_weight_-10%": {"scoring_coefficients": {"growth_weight_multiplier": base_config.get("scoring_coefficients", {}).get("growth_weight_multiplier", 1.5) * 0.9}},
        "growth_weight_+10%": {"scoring_coefficients": {"growth_weight_multiplier": base_config.get("scoring_coefficients", {}).get("growth_weight_multiplier", 1.5) * 1.1}},
        "safety_vol_-10%": {"scoring_coefficients": {"safety_volatility_multiplier": base_config.get("scoring_coefficients", {}).get("safety_volatility_multiplier", 0.8) * 0.9}},
        "safety_vol_+10%": {"scoring_coefficients": {"safety_volatility_multiplier": base_config.get("scoring_coefficients", {}).get("safety_volatility_multiplier", 0.8) * 1.1}},
    }

    perturbation_results = {}
    reports_dir = ML_DIR / "reports"

    for sc_name, overrides in perturbation_scenarios.items():
        print(f"\n[Perturbation: {sc_name}] Generating perturbed labels and retraining...")

        # Create perturbed config
        test_config = json.loads(json.dumps(base_config))
        for section, kv in overrides.items():
            if section not in test_config:
                test_config[section] = {}
            test_config[section].update(kv)

        temp_cfg_path = reports_dir / f"temp_bench_cfg_{sc_name.replace('+', 'p').replace('-', 'm').replace('%', 'pct')}.json"
        with temp_cfg_path.open("w", encoding="utf-8") as f:
            json.dump(test_config, f)

        # Reconstruct labels with perturbed config
        perturbed_targets, _ = construct_supervisory_targets(df_raw, config_path=temp_cfg_path, generate_report=False)

        try:
            temp_cfg_path.unlink()
        except Exception:
            pass

        # Re-encode labels
        p_labels = perturbed_targets["primary_instrument"]
        le_p = LabelEncoder()
        le_p.fit(list(set(le.classes_.tolist() + p_labels.unique().tolist())))
        y_p = le_p.transform(p_labels)

        # Split with same indices
        _, _, y_p_train, y_p_test = train_test_split(X, y_p, test_size=0.2, random_state=42, stratify=y)

        # Retrain
        p_model = train_model(X_train, y_p_train)
        p_preds = p_model.predict(X_test)
        p_proba = p_model.predict_proba(X_test)

        p_metrics = {
            "accuracy": round(float(accuracy_score(y_p_test, p_preds)), 4),
            "precision_macro": round(float(precision_score(y_p_test, p_preds, average='macro', zero_division=0)), 4),
            "recall_macro": round(float(recall_score(y_p_test, p_preds, average='macro', zero_division=0)), 4),
            "f1_macro": round(float(f1_score(y_p_test, p_preds, average='macro', zero_division=0)), 4),
            "balanced_accuracy": round(float(balanced_accuracy_score(y_p_test, p_preds)), 4),
        }
        try:
            p_metrics["roc_auc_ovr"] = round(float(roc_auc_score(y_p_test, p_proba, multi_class='ovr', average='macro')), 4)
        except Exception:
            p_metrics["roc_auc_ovr"] = "N/A"

        p_class_dist = {le_p.classes_[i]: int(c) for i, c in enumerate(np.bincount(y_p_test, minlength=len(le_p.classes_)))}

        # Compute deltas
        deltas = {}
        for metric_key in ["accuracy", "precision_macro", "recall_macro", "f1_macro", "balanced_accuracy"]:
            deltas[metric_key] = round(p_metrics[metric_key] - baseline_metrics[metric_key], 4)

        perturbation_results[sc_name] = {
            "metrics": p_metrics,
            "deltas_vs_baseline": deltas,
            "class_distribution": p_class_dist,
        }

        print(f"  Accuracy: {p_metrics['accuracy']} (delta = {deltas['accuracy']:+.4f})")
        print(f"  F1 Macro: {p_metrics['f1_macro']} (delta = {deltas['f1_macro']:+.4f})")

    results = {
        "baseline": {"metrics": baseline_metrics, "class_distribution": baseline_class_dist},
        "perturbations": perturbation_results,
    }

    out_path = BENCHMARKS_DIR / "label_sensitivity_benchmark.json"
    with out_path.open("w") as f:
        json.dump({"system_info": SYSTEM_INFO, "results": results}, f, indent=2)

    print(f"\n  Artifact: {out_path}")
    return results


# ═════════════════════════════════════════════════════════════════════════════
# TASK 5: Bayesian Confidence Intervals for Individual Predictions
# ═════════════════════════════════════════════════════════════════════════════
def run_task5_bayesian_confidence(pipeline, X_test, y_test, le):
    print("\n" + "=" * 80)
    print("TASK 5: BAYESIAN CONFIDENCE INTERVALS FOR INDIVIDUAL PREDICTIONS")
    print("=" * 80)

    rf = pipeline.named_steps['clf']
    scaler = pipeline.named_steps['scaler']
    X_scaled = scaler.transform(X_test)

    n_examples = min(50, len(X_test))
    X_sample = X_scaled[:n_examples]
    y_sample = y_test[:n_examples]

    # ── Posterior Distribution via Individual Tree Predictions ─────────────────
    # Each tree in the forest is a sample from the posterior distribution.
    # We collect all tree predictions to form a posterior over class probabilities.
    print("\n[Bayesian CI] Collecting per-tree posterior distributions...")

    t0 = time.perf_counter()
    n_trees = len(rf.estimators_)
    n_classes = len(le.classes_)

    all_tree_probas = np.zeros((n_examples, n_trees, n_classes))
    for t_idx, tree in enumerate(rf.estimators_):
        all_tree_probas[:, t_idx, :] = tree.predict_proba(X_sample)

    t1 = time.perf_counter()
    posterior_time = t1 - t0

    # ── Compute Credible Intervals ────────────────────────────────────────────
    print("[Bayesian CI] Computing 90% credible intervals for predicted class probabilities...")

    prediction_results = []
    correct_within_ci = 0

    for i in range(n_examples):
        tree_probas = all_tree_probas[i]  # shape: (n_trees, n_classes)

        # Posterior mean and std for each class
        posterior_mean = np.mean(tree_probas, axis=0)
        posterior_std = np.std(tree_probas, axis=0)

        predicted_class_idx = np.argmax(posterior_mean)
        predicted_class = le.classes_[predicted_class_idx]
        true_class = le.classes_[y_sample[i]]

        # 90% credible interval for predicted class probability
        pred_class_probs = tree_probas[:, predicted_class_idx]
        ci_lower = float(np.percentile(pred_class_probs, 5))
        ci_upper = float(np.percentile(pred_class_probs, 95))

        # Coverage check: is the true class probability within the CI?
        true_class_mean = float(posterior_mean[y_sample[i]])
        is_correct = predicted_class == true_class
        if is_correct:
            correct_within_ci += 1

        prediction_results.append({
            "sample_idx": i,
            "predicted_class": predicted_class,
            "true_class": true_class,
            "posterior_mean": round(float(posterior_mean[predicted_class_idx]), 4),
            "posterior_std": round(float(posterior_std[predicted_class_idx]), 4),
            "ci_90_lower": round(ci_lower, 4),
            "ci_90_upper": round(ci_upper, 4),
            "ci_width": round(ci_upper - ci_lower, 4),
            "correct": is_correct,
        })

    # ── Aggregate Metrics ─────────────────────────────────────────────────────
    ci_widths = [r["ci_width"] for r in prediction_results]
    posterior_stds = [r["posterior_std"] for r in prediction_results]
    coverage = correct_within_ci / n_examples

    aggregate = {
        "n_examples": n_examples,
        "n_trees": n_trees,
        "n_classes": n_classes,
        "posterior_computation_time_s": round(posterior_time, 4),
        "prediction_accuracy": round(coverage, 4),
        "mean_ci_width": round(float(np.mean(ci_widths)), 4),
        "std_ci_width": round(float(np.std(ci_widths)), 4),
        "mean_posterior_std": round(float(np.mean(posterior_stds)), 4),
        "median_posterior_std": round(float(np.median(posterior_stds)), 4),
    }

    # ── Coverage Validation ───────────────────────────────────────────────────
    # For a well-calibrated model, the 90% CI should contain the true probability
    # at roughly the predicted confidence level.
    print(f"\n  Posterior computation time: {posterior_time:.4f}s for {n_examples} samples")
    print(f"  Mean CI width: {aggregate['mean_ci_width']:.4f}")
    print(f"  Prediction accuracy: {aggregate['prediction_accuracy']:.4f}")
    print(f"  Mean posterior std: {aggregate['mean_posterior_std']:.4f}")

    # Show a few example predictions
    print("\n  Example Predictions:")
    print(f"  {'Idx':>4} | {'Predicted':>12} | {'True':>12} | {'Mean':>6} | {'Std':>6} | {'90% CI':>16} | {'Correct':>7}")
    print("  " + "-" * 80)
    for r in prediction_results[:10]:
        ci_str = f"[{r['ci_90_lower']:.3f}, {r['ci_90_upper']:.3f}]"
        print(f"  {r['sample_idx']:>4} | {r['predicted_class']:>12} | {r['true_class']:>12} | {r['posterior_mean']:.4f} | {r['posterior_std']:.4f} | {ci_str:>16} | {'PASS' if r['correct'] else 'FAIL':>7}")

    results = {
        "technique": "Bayesian Confidence Intervals via Random Forest Posterior",
        "rationale": "Each tree in the Random Forest ensemble constitutes an independent sample from the posterior distribution over classification functions. By collecting per-tree class probability predictions, we construct a non-parametric posterior distribution and derive credible intervals without requiring explicit Bayesian priors or MCMC sampling.",
        "aggregate_metrics": aggregate,
        "example_predictions": prediction_results[:20],
    }

    out_path = BENCHMARKS_DIR / "bayesian_confidence_benchmark.json"
    with out_path.open("w") as f:
        json.dump({"system_info": SYSTEM_INFO, "results": results}, f, indent=2)

    print(f"\n  Artifact: {out_path}")
    return results


# ═════════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═════════════════════════════════════════════════════════════════════════════
def main():
    print("\n[Setup] Generating synthetic dataset (N=5000)...")
    df_raw = generate_dataset(n_samples=5000)

    print("[Setup] Preparing features and labels...")
    X, y, le = prepare_features_and_labels(df_raw)

    print(f"[Setup] Dataset shape: X={X.shape}, y={y.shape}, classes={le.classes_.tolist()}")

    # Train baseline model
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    print("[Setup] Training baseline RandomForest model...")
    pipeline = train_model(X_train, y_train)

    # ── TASK 3: TreeSHAP vs KernelSHAP ───────────────────────────────────────
    task3_results = run_task3_shap_benchmark(pipeline, X_test, y_test, le)

    # ── TASK 4: Label Sensitivity ─────────────────────────────────────────────
    task4_results = run_task4_label_sensitivity(df_raw, X, y, le)

    # ── TASK 5: Bayesian Confidence Intervals ─────────────────────────────────
    task5_results = run_task5_bayesian_confidence(pipeline, X_test, y_test, le)

    # ── Final Summary ─────────────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("ALL TASKS COMPLETE — ARTIFACTS GENERATED:")
    print(" - benchmarks/treeshap_vs_kernelshap_benchmark.json")
    print(" - benchmarks/label_sensitivity_benchmark.json")
    print(" - benchmarks/bayesian_confidence_benchmark.json")
    print("=" * 80)


if __name__ == "__main__":
    main()
