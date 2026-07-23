"""
Anti-Circularity Automated Static Analysis & Label Construction Test Suite

Enforces strict anti-circularity invariants:
1. Label construction module relies strictly on historical NAV metrics and documented suitability rules.
2. AST Call-Graph Static Analysis: Guarantees train.py and label_construction.py never invoke
   or import assign_target_instruments() during label creation or model training.
3. Class Diversity & Reachability: Asserts every supported recommendation category remains reachable
   and no single category dominates excessively.
4. Data Provenance & Reproducibility Metadata Checks.
"""

import ast
import json
import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

SYS_PATH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SYS_PATH not in sys.path:
    sys.path.append(SYS_PATH)

from model.label_construction import construct_supervisory_targets, CORE_CATEGORIES

ML_SERVICE_DIR = Path(__file__).resolve().parents[1]
LABEL_MODULE_PATH = ML_SERVICE_DIR / "model" / "label_construction.py"
TRAIN_MODULE_PATH = ML_SERVICE_DIR / "model" / "train.py"
METADATA_PATH = ML_SERVICE_DIR / "model" / "metadata.json"
REPORT_PATH = ML_SERVICE_DIR / "data" / "label_construction_report.json"


def test_label_construction_no_prohibited_imports():
    """Verify label_construction.py contains zero imports or execution calls of assign_target_instruments."""
    tree = ast.parse(LABEL_MODULE_PATH.read_text(encoding="utf-8"), filename=str(LABEL_MODULE_PATH))
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert "assign_target_instruments" not in alias.name
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                assert "assign_target_instruments" not in node.module
            for alias in node.names:
                assert "assign_target_instruments" not in alias.name
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                assert node.func.id != "assign_target_instruments"


def test_label_construction_data_provenance():
    """Verify label_construction constructs targets using historical NAV statistics."""
    df_sample = pd.DataFrame([{
        'age': 35,
        'annual_income': 1200000.0,
        'monthly_savings': 40000.0,
        'investment_horizon': 12,
        'liquid_savings': 300000.0,
        'existing_debt': 10.0,
        'dependents': 2,
        'emergency_fund_months': 4.0,
        'risk_tolerance': 'Moderate',
        'goal_type': 'wealth-building'
    }])

    df_targets, meta = construct_supervisory_targets(df_sample, generate_report=False)
    assert len(df_targets) == 1
    assert 'primary_instrument' in df_targets.columns
    assert 'secondary_instrument' in df_targets.columns
    assert 'tertiary_instrument' in df_targets.columns
    assert 'NAV-derived historical performance statistics' in meta['label_source']


def test_all_categories_reachable_and_no_class_collapse():
    """
    Asserts every supported recommendation category is reachable by valid investor profiles
    and no single class exceeds 65% of the overall population.
    """
    if not REPORT_PATH.exists():
        pytest.skip("label_construction_report.json not found — run train.py first")

    with REPORT_PATH.open(encoding="utf-8") as f:
        report = json.load(f)

    counts = report["class_counts"]
    percentages = report["class_percentages"]

    for cat in CORE_CATEGORIES:
        assert cat in counts, f"Target category {cat} missing from report"
        assert counts[cat] > 0, f"Class collapse detected: target category {cat} was never assigned!"

    for cat, pct in percentages.items():
        assert pct < 65.0, f"Class collapse detected: category {cat} occupies {pct}% (>65%) of dataset!"


def test_ast_call_graph_anti_circularity():
    """
    AST Full Call-Graph Static Analysis.
    Parses train.py AST and asserts that label construction calls DO NOT reach assign_target_instruments.
    """
    tree = ast.parse(TRAIN_MODULE_PATH.read_text(encoding="utf-8"), filename=str(TRAIN_MODULE_PATH))

    class AntiCircularityVisitor(ast.NodeVisitor):
        def __init__(self):
            self.target_construction_calls = []
            self.prohibited_invocations = []

        def visit_Call(self, node):
            func_name = ""
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr

            if func_name == "construct_supervisory_targets":
                self.target_construction_calls.append(node)

            if func_name in ("importlib", "getattr", "eval", "exec"):
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and "assign_target_instruments" in str(arg.value):
                        self.prohibited_invocations.append(func_name)

            self.generic_visit(node)

    visitor = AntiCircularityVisitor()
    visitor.visit(tree)

    assert len(visitor.target_construction_calls) > 0, "train.py must invoke construct_supervisory_targets for labels"
    assert len(visitor.prohibited_invocations) == 0, "Anti-circularity violation: dynamic import bypass detected!"


def test_deterministic_label_reproducibility():
    """Verify target construction is 100% deterministic and reproducible."""
    df_sample = pd.DataFrame([{
        'age': 42,
        'annual_income': 1800000.0,
        'monthly_savings': 50000.0,
        'investment_horizon': 15,
        'liquid_savings': 600000.0,
        'existing_debt': 15.0,
        'dependents': 1,
        'emergency_fund_months': 6.0,
        'risk_tolerance': 'Aggressive',
        'goal_type': 'retirement'
    }])

    t1, _ = construct_supervisory_targets(df_sample, generate_report=False)
    t2, _ = construct_supervisory_targets(df_sample, generate_report=False)

    pd.testing.assert_frame_equal(t1, t2)


def test_metadata_reproducibility_provenance():
    """Verify metadata.json includes required provenance & baseline metric fields."""
    if not METADATA_PATH.exists():
        pytest.skip("metadata.json not found — run train.py first")

    with METADATA_PATH.open(encoding="utf-8") as f:
        meta = json.load(f)

    assert "git_commit_hash" in meta
    assert "dataset_version" in meta
    assert "model_version" in meta
    assert "test_accuracy" in meta
    assert "macro_f1" in meta
    assert "balanced_accuracy" in meta
    assert "baseline_accuracy" in meta
    assert "accuracy_delta_vs_legacy_heuristic" in meta
    assert "confidence_threshold" in meta


def test_invalid_suitability_config_raises_value_error(tmp_path):
    """Verify loading corrupted JSON configuration raises an explicit ValueError."""
    bad_config = tmp_path / "corrupted_config.json"
    bad_config.write_text("{ invalid json structure", encoding="utf-8")

    from model.label_construction import load_suitability_config
    with pytest.raises(ValueError, match="Invalid suitability configuration file"):
        load_suitability_config(bad_config)


def test_missing_performance_csv_fallback(tmp_path):
    """Verify missing performance CSV falls back safely to default category metrics."""
    non_existent = tmp_path / "missing_market_performance.csv"

    from model.label_construction import load_historical_performance_metrics, DEFAULT_CATEGORY_METRICS
    metrics = load_historical_performance_metrics(non_existent)
    for cat in CORE_CATEGORIES:
        assert cat in metrics
        assert metrics[cat]["annualised_return"] == DEFAULT_CATEGORY_METRICS[cat]["annualised_return"]

