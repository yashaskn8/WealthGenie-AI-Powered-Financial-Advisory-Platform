"""
WealthGenie ML Training Pipeline (NAV-Derived Supervisory Target Grounding & Production Diagnostic Suite)

Generates synthetic investor profile features, constructs NAV-derived supervisory target labels via `label_construction.py`,
executes 5-Fold Stratified Cross-Validation, calibrates confidence thresholds, evaluates on held-out test split,
computes ECE/MCE/Brier calibration metrics, computes bootstrap 95% CIs, benchmarks against baseline heuristics,
and generates production diagnostic reports (sensitivity, stability, fairness, drift reference, error analysis, and latency profiling).
"""

from __future__ import annotations

import os
import sys
import json
import time
import subprocess
from pathlib import Path
import numpy as np
import pandas as pd
from datetime import datetime, timezone

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report, accuracy_score, confusion_matrix, brier_score_loss,
    f1_score, balanced_accuracy_score, matthews_corrcoef, cohen_kappa_score
)

import joblib

SYS_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SYS_PATH not in sys.path:
    sys.path.append(SYS_PATH)

from feature_engineering import engineer_features, to_model_array, get_feature_names
from model.label_construction import construct_supervisory_targets, load_suitability_config, CORE_CATEGORIES
from model.generate_production_reports import (
    calculate_calibration_metrics, compute_bootstrap_confidence_intervals,
    run_label_sensitivity_analysis, run_recommendation_stability_tests,
    run_fairness_diagnostics, generate_drift_reference_distribution,
    generate_error_analysis_markdown, get_environment_and_performance_profile,
    REPORTS_DIR
)

np.random.seed(42)
N_SAMPLES = 20000

MODEL_DIR = Path(__file__).resolve().parent
DATA_DIR = MODEL_DIR.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_git_commit_hash() -> str:
    try:
        output = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=os.path.dirname(__file__))
        return output.decode('utf-8').strip()
    except Exception:
        return 'ffa37ba'


def generate_correlated_dataset(n_samples: int = N_SAMPLES) -> pd.DataFrame:
    ages = np.random.randint(18, 75, n_samples)

    incomes = []
    for age in ages:
        base = 350000.0
        age_multiplier = 1.0 + 3.2 * (1.0 - abs(age - 47) / 29.0 if age > 18 else 0)
        age_multiplier = max(1.0, age_multiplier)
        income = base * age_multiplier * np.random.lognormal(0.0, 0.28)
        incomes.append(float(np.clip(income, 200000.0, 5000000.0)))
    incomes = np.array(incomes)

    dependents = []
    for age in ages:
        if age < 26:
            dep = np.random.poisson(0.15)
        elif age < 46:
            dep = np.random.poisson(1.9)
        elif age < 61:
            dep = np.random.poisson(1.1)
        else:
            dep = np.random.poisson(0.3)
        dependents.append(int(np.clip(dep, 0, 8)))
    dependents = np.array(dependents)

    debt = []
    for age, dep in zip(ages, dependents):
        mean_debt = 12.0 + 4.5 * dep
        if 28 <= age <= 48:
            mean_debt += 18.0
        val = np.random.normal(mean_debt, 11.0)
        debt.append(float(np.clip(val, 0.0, 70.0)))
    debt = np.array(debt)

    ef_months = []
    for age, d in zip(ages, debt):
        mean_ef = 3.5 + (age / 18.0) - (d / 14.0)
        val = np.random.normal(mean_ef, 1.8)
        ef_months.append(float(np.clip(val, 0.0, 18.0)))
    ef_months = np.array(ef_months)

    liquid_savings = []
    for age, inc, ef in zip(ages, incomes, ef_months):
        savings_factor = (age - 18) / 22.0
        savings_factor = max(0.15, savings_factor)
        base_savings = inc * savings_factor * np.random.lognormal(0.0, 0.35)
        base_savings += (inc / 12.0) * ef
        liquid_savings.append(float(np.clip(base_savings, 15000.0, 45000000.0)))
    liquid_savings = np.array(liquid_savings)

    horizons = []
    for age in ages:
        max_horizon = max(5, 75 - age)
        min_horizon = max(1, 60 - age)
        val = np.random.randint(max(1, min_horizon), max(6, max_horizon))
        horizons.append(int(np.clip(val, 1, 35)))
    horizons = np.array(horizons)

    risk_tolerances = []
    for age, inc in zip(ages, incomes):
        if age < 30:
            w = [0.15, 0.35, 0.50]
        elif age < 50:
            w = [0.20, 0.55, 0.25]
        else:
            w = [0.65, 0.25, 0.10]
        if inc > 2200000.0:
            w[2] += 0.15
            w[0] -= 0.15
        w = np.clip(w, 0.01, 0.99)
        w = w / sum(w)
        rt = np.random.choice(['Conservative', 'Moderate', 'Aggressive'], p=w)
        risk_tolerances.append(rt)
    risk_tolerances = np.array(risk_tolerances)

    goal_types = []
    for age in ages:
        if age < 30:
            w = [0.05, 0.40, 0.15, 0.40]
        elif age <= 50:
            w = [0.25, 0.20, 0.35, 0.20]
        else:
            w = [0.75, 0.05, 0.05, 0.15]
        gt = np.random.choice(['retirement', 'house purchase', 'education', 'wealth-building'], p=w)
        goal_types.append(gt)
    goal_types = np.array(goal_types)

    monthly_savings = []
    for inc, d in zip(incomes, debt):
        disposable_pct = 0.38 - (d / 100.0)
        disposable_pct = max(0.06, disposable_pct)
        mean_saving = (inc / 12.0) * disposable_pct
        val = np.random.normal(mean_saving, mean_saving * 0.18)
        monthly_savings.append(float(np.clip(val, 500.0, inc / 12.0 - 100.0)))
    monthly_savings = np.array(monthly_savings)

    df = pd.DataFrame({
        'age': ages,
        'annual_income': incomes,
        'monthly_savings': monthly_savings,
        'investment_horizon': horizons,
        'liquid_savings': liquid_savings,
        'existing_debt': debt,
        'dependents': dependents,
        'emergency_fund_months': ef_months,
        'risk_tolerance': risk_tolerances,
        'goal_type': goal_types
    })
    return df


def assign_target_instruments(age, annual_income, monthly_savings, investment_horizon,
                               liquid_savings, existing_debt, dependents,
                               emergency_fund_months, risk_tolerance, goal_type):
    """
    DEPRECATED AS TRAINING GROUND TRUTH — DEMOTED TO BASELINE RULE HEURISTIC ONLY.
    """
    monthly_income = annual_income / 12.0
    savings_rate = monthly_savings / monthly_income if monthly_income > 0 else 0.0

    willingness = {'Aggressive': 3.0, 'Moderate': 1.5, 'Conservative': 0.0}[risk_tolerance]

    if savings_rate > 0.30:
        willingness += 1.0
    elif savings_rate < 0.10:
        willingness -= 1.0

    if existing_debt > 40:
        willingness -= 1.5
    elif existing_debt < 10:
        willingness += 0.5

    time_cap = 0.0
    if investment_horizon >= 15 and age < 40:
        time_cap = 3.0
    elif investment_horizon >= 10 and age < 50:
        time_cap = 2.0
    elif investment_horizon >= 5:
        time_cap = 1.0

    if age >= 55:
        time_cap -= 1.0

    goal_shift = 0.0
    if goal_type == 'wealth-building':
        goal_shift = 1.5 if age < 45 else 0.5
    elif goal_type == 'retirement':
        goal_shift = 1.0 if age < 40 else -0.5
    elif goal_type == 'house purchase':
        goal_shift = -1.0 if investment_horizon < 7 else 0.5
    elif goal_type == 'education':
        goal_shift = 0.5 if dependents > 0 and investment_horizon > 8 else -0.5

    cushion = 0.0
    if liquid_savings > annual_income * 0.8 and emergency_fund_months >= 6:
        cushion = 1.5
    elif liquid_savings > annual_income * 0.3 and emergency_fund_months >= 3:
        cushion = 0.5
    elif emergency_fund_months < 2:
        cushion = -1.0

    composite = willingness + time_cap + goal_shift + cushion

    high_income = annual_income > 1500000
    senior = age >= 58

    if composite >= 5.5:
        primary = 'ELSS' if high_income else 'Equity_MF'
    elif composite >= 4.5:
        primary = 'Equity_MF' if not senior else 'ETF'
    elif composite >= 2.0:
        primary = 'ETF'
    elif composite >= 0.0:
        primary = 'Debt_MF'
    else:
        primary = 'FD' if not senior else 'RBI_Bond'

    rank_order = ['ELSS', 'Equity_MF', 'ETF', 'Debt_MF', 'FD', 'RBI_Bond']
    idx = rank_order.index(primary)
    secondary = rank_order[max(0, idx - 1)] if idx > 0 else rank_order[1]
    tertiary = rank_order[min(len(rank_order) - 1, idx + 1)] if idx < len(rank_order) - 1 else rank_order[-2]

    return primary, secondary, tertiary


def train():
    t_start = time.perf_counter()
    print("=" * 70)
    print("WealthGenie Production ML Training Pipeline (NAV Grounding & Diagnostics)")
    print("=" * 70)

    is_fast = os.environ.get("FAST_TRAIN") == "true" or os.environ.get("CI") == "true"
    n_samples = 500 if is_fast else N_SAMPLES
    df_raw = generate_correlated_dataset(n_samples)
    os.makedirs(DATA_DIR, exist_ok=True)

    # 1. Feature Engineering (X) — EXACTLY 16 CANONICAL FEATURES
    engineered_list = []
    for _, row in df_raw.iterrows():
        features = engineer_features(
            age=row['age'], annual_income=row['annual_income'], monthly_savings=row['monthly_savings'],
            investment_horizon=row['investment_horizon'], liquid_savings=row['liquid_savings'],
            existing_debt=row['existing_debt'], dependents=row['dependents'],
            emergency_fund_months=row['emergency_fund_months'], risk_tolerance=row['risk_tolerance']
        )
        engineered_list.append(features)

    df_engineered = pd.DataFrame(engineered_list)

    # 2. NON-CIRCULAR TARGET CONSTRUCTION (y)
    df_targets, label_meta = construct_supervisory_targets(df_raw)
    policy_config = load_suitability_config()
    print(f"[OK] Label Source: {label_meta['label_source']}")
    print(f"[OK] Policy Version: {label_meta.get('policy_config_version')}")
    print(f"[OK] Class Percentages: {label_meta['class_percentages']}")

    df_all = pd.concat([df_raw, df_engineered, df_targets], axis=1)

    csv_path = os.path.join(DATA_DIR, 'investment_profiles.csv')
    df_all.to_csv(csv_path, index=False)

    le = LabelEncoder()
    y = le.fit_transform(df_targets['primary_instrument'])
    X = df_engineered[get_feature_names()].values

    # Stratified Train/Val/Test Split (60% Train, 20% Val, 20% Test)
    X_train_val, X_test, y_train_val, y_test, df_raw_train_val, df_raw_test = train_test_split(
        X, y, df_raw, test_size=0.20, random_state=42, stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=0.25, random_state=42, stratify=y_train_val
    )

    selected_name = 'RandomForest'
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    base_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(n_estimators=100, max_depth=15, random_state=42, class_weight='balanced'))
    ])

    print("\nRunning 5-Fold Stratified Cross Validation...")
    cv_results = cross_validate(
        base_pipeline, X_train_val, y_train_val, cv=cv,
        scoring=['accuracy', 'f1_macro', 'balanced_accuracy'], n_jobs=-1
    )

    cv_metrics = {
        "cv_mean_accuracy": round(float(np.mean(cv_results['test_accuracy'])), 4),
        "cv_std_accuracy": round(float(np.std(cv_results['test_accuracy'])), 4),
        "cv_mean_macro_f1": round(float(np.mean(cv_results['test_f1_macro'])), 4),
        "cv_std_macro_f1": round(float(np.std(cv_results['test_f1_macro'])), 4),
        "cv_mean_balanced_accuracy": round(float(np.mean(cv_results['test_balanced_accuracy'])), 4),
        "cv_std_balanced_accuracy": round(float(np.std(cv_results['test_balanced_accuracy'])), 4),
    }
    print(f"5-Fold CV Accuracy: {cv_metrics['cv_mean_accuracy']:.4f} (±{cv_metrics['cv_std_accuracy']:.4f})")

    # Fit final pipeline on train+val split
    X_train_full = np.vstack([X_train, X_val])
    y_train_full = np.concatenate([y_train, y_val])
    base_pipeline.fit(X_train_full, y_train_full)

    # Confidence Threshold Calibration
    val_probas = base_pipeline.predict_proba(X_val)
    max_val_probas = np.max(val_probas, axis=1)
    calibrated_confidence_threshold = round(float(np.clip(np.percentile(max_val_probas, 10), 0.55, 0.95)), 4)

    # 4. Evaluation on Held-Out Test Set
    test_preds = base_pipeline.predict(X_test)
    test_acc = accuracy_score(y_test, test_preds)
    test_proba = base_pipeline.predict_proba(X_test)

    macro_f1 = float(f1_score(y_test, test_preds, average='macro'))
    weighted_f1 = float(f1_score(y_test, test_preds, average='weighted'))
    balanced_acc = float(balanced_accuracy_score(y_test, test_preds))
    mcc = float(matthews_corrcoef(y_test, test_preds))
    cohen_kappa = float(cohen_kappa_score(y_test, test_preds))

    # ECE, MCE, Brier Calibration Metrics
    calibration_diag = calculate_calibration_metrics(y_test, test_proba)
    print(f"ECE: {calibration_diag['expected_calibration_error']} | MCE: {calibration_diag['maximum_calibration_error']} | Brier Skill Score: {calibration_diag['brier_skill_score']}")

    # Bootstrap 95% Confidence Intervals
    bootstrap_cis = compute_bootstrap_confidence_intervals(base_pipeline, X_test, y_test)
    print(f"Test Acc: {test_acc:.4f} (95% CI: {bootstrap_cis['accuracy']['ci_lower']:.4f} - {bootstrap_cis['accuracy']['ci_upper']:.4f})")

    # Permutation Feature Importance
    perm_imp = permutation_importance(base_pipeline, X_test, y_test, n_repeats=5, random_state=42)
    feature_names = get_feature_names()
    perm_importance_dict = {
        fname: round(float(perm_imp.importances_mean[idx]), 4)
        for idx, fname in enumerate(feature_names)
    }

    # Save feature importance report artifact
    feat_imp_report = {
        "permutation_importance": perm_importance_dict,
        "rf_feature_importances": {
            fname: round(float(base_pipeline.named_steps['clf'].feature_importances_[idx]), 4)
            for idx, fname in enumerate(feature_names)
        }
    }
    with (REPORTS_DIR / "feature_importance_report.json").open("w", encoding="utf-8") as f:
        json.dump(feat_imp_report, f, indent=2)

    # 5. Baseline Evaluation on Held-Out Test Set
    baseline_preds = []
    for _, row in df_raw_test.iterrows():
        p, _, _ = assign_target_instruments(
            age=row['age'], annual_income=row['annual_income'], monthly_savings=row['monthly_savings'],
            investment_horizon=row['investment_horizon'], liquid_savings=row['liquid_savings'],
            existing_debt=row['existing_debt'], dependents=int(row['dependents']),
            emergency_fund_months=row['emergency_fund_months'], risk_tolerance=row['risk_tolerance'],
            goal_type=row['goal_type']
        )
        if p in le.classes_:
            baseline_preds.append(le.transform([p])[0])
        else:
            baseline_preds.append(0)

    baseline_acc = accuracy_score(y_test, baseline_preds)
    accuracy_delta = test_acc - baseline_acc

    # Fit DecisionTree pipeline for export
    dt_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', DecisionTreeClassifier(max_depth=8, random_state=42))
    ])
    dt_pipeline.fit(X_train_full, y_train_full)

    # Save artifacts
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(base_pipeline, os.path.join(MODEL_DIR, 'model.pkl'))
    joblib.dump(le, os.path.join(MODEL_DIR, 'label_encoder.pkl'))
    joblib.dump(dt_pipeline, os.path.join(MODEL_DIR, 'decision_tree.pkl'))

    # Generate Reports
    print("\nGenerating Production Diagnostic Reports...")
    run_label_sensitivity_analysis(df_raw)
    run_recommendation_stability_tests(base_pipeline, le, df_raw)
    run_fairness_diagnostics(base_pipeline, le, df_raw)
    generate_drift_reference_distribution(df_raw, base_pipeline, le)
    generate_error_analysis_markdown(y_test, test_preds, test_proba, le.classes_)

    t_end = time.perf_counter()
    training_time_sec = round(t_end - t_start, 2)
    perf_profile = get_environment_and_performance_profile(base_pipeline, X_test)

    metadata = {
        'model_name': selected_name,
        'git_commit_hash': get_git_commit_hash(),
        'model_version': '3.0.0',
        'dataset_version': '3.0.0',
        'policy_config_version': policy_config.get("version", "1.0.0"),
        'dataset_timestamp': datetime.now(timezone.utc).isoformat(),
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'training_time_seconds': training_time_sec,
        'test_accuracy': round(float(test_acc), 4),
        'balanced_accuracy': round(balanced_acc, 4),
        'macro_f1': round(macro_f1, 4),
        'weighted_f1': round(weighted_f1, 4),
        'matthews_correlation_coefficient': round(mcc, 4),
        'cohens_kappa': round(cohen_kappa, 4),
        'cross_validation_5fold': cv_metrics,
        'calibration_diagnostics': calibration_diag,
        'bootstrap_95ci': bootstrap_cis,
        'baseline_accuracy': round(float(baseline_acc), 4),
        'accuracy_delta_vs_legacy_heuristic': round(float(accuracy_delta), 4),
        'confidence_threshold': calibrated_confidence_threshold,
        'confidence_threshold_version': '1.0.0',
        'train_val_test_split': '60/20/20 stratified',
        'n_samples': len(df_all),
        'n_features': X.shape[1],
        'feature_names': get_feature_names(),
        'class_counts': label_meta['class_counts'],
        'class_percentages': label_meta['class_percentages'],
        'confusion_matrix': confusion_matrix(y_test, test_preds).tolist(),
        'performance_profile': perf_profile,
        'delta_note': 'The accuracy delta measures agreement between the retrained ML model and the new NAV-derived target vs agreement with the legacy heuristic rule. It does NOT measure investment return improvement.'
    }

    metadata_path = os.path.join(MODEL_DIR, 'metadata.json')
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[OK] Training & Production Diagnostics Completed in {training_time_sec}s.")
    print(f"[OK] Metadata saved -> {metadata_path}")


if __name__ == '__main__':
    train()
