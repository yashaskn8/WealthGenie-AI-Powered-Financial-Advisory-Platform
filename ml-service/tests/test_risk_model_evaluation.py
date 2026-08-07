"""
Phase 4 Rigor Evaluation & Non-Circularity Verification Test Suite
"""

import pytest
import numpy as np
from model.evaluation.rigor_evaluator import (
    audit_feature_overlap,
    audit_formula_logic_overlap,
    construct_independent_cfp_benchmark_targets,
    run_full_rigor_audit,
)


def test_feature_overlap_audit():
    """Verifies that the circular feature overlap audit runs and detects base feature overlap."""
    audit = audit_feature_overlap()
    assert audit["classifier_feature_count"] == 16
    assert audit["base_feature_overlap_percentage"] == 100.0
    assert "age" in audit["overlapping_features"]
    assert "annual_income" in audit["overlapping_features"]


def test_independent_cfp_benchmark_zero_overlap():
    """Verifies programmatically calculated zero formula overlap and multi-model independent benchmark performance."""
    formula_audit = audit_formula_logic_overlap()
    assert formula_audit["formula_overlap_percentage"] == 0.0
    assert len(formula_audit["shared_math_terms"]) == 0

    report = run_full_rigor_audit()
    indep = report["independent_organic_benchmark"]
    assert "independent_benchmark_accuracy" in indep
    assert indep["formula_overlap_with_training_labeler"] == 0.0

    # Multi-model evaluation checks (RF, MLP, FT-Transformer)
    multi_model = report["multi_model_independent_benchmark"]
    assert "RandomForest" in multi_model
    assert "PyTorch_FinancialMLP" in multi_model
    assert "FT_Transformer" in multi_model

    # Verify headline FT-Transformer claim model is evaluated and collapses on independent benchmark
    ft_res = multi_model["FT_Transformer"]
    assert ft_res["independent_cfp_benchmark_accuracy"] < 0.30
    rf_res = multi_model["RandomForest"]
    assert rf_res["independent_cfp_benchmark_accuracy"] < 0.30


def test_rigor_evaluation_reproducibility():
    """Verifies that the full rigor evaluation audit is reproducible and outputs all required metrics."""
    report = run_full_rigor_audit()

    assert "metric_reframe" in report
    assert report["metric_reframe"]["reframed_metric_name"] == "Rule-Approximation Fidelity"

    # Feature ablation
    ablation = report["feature_ablation_impact"]
    assert len(ablation) == 16
    assert "stated_tolerance_score" in ablation

    # Noise robustness
    noise = report["noise_robustness"]
    assert "noise_std_5pct_accuracy" in noise
    assert "noise_std_10pct_accuracy" in noise
    assert "noise_std_20pct_accuracy" in noise

    # Assert noise degrades fidelity monotonically
    assert noise["noise_std_5pct_accuracy"] >= noise["noise_std_10pct_accuracy"]
    assert noise["noise_std_10pct_accuracy"] >= noise["noise_std_20pct_accuracy"]

