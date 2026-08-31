import numpy as np

from model.registry.drift_monitor import generate_synthetic_feature_batch


def test_synthetic_drift_batch_uses_serving_feature_units_and_formulas():
    batch = generate_synthetic_feature_batch(n_samples=64, seed=123)

    assert batch["existing_debt"].between(0.0, 50.0).all()
    assert batch["risk_score"].between(0.0, 100.0).all()
    assert set(batch["stated_tolerance_score"].unique()) <= {20.0, 60.0, 100.0}
    np.testing.assert_allclose(
        batch["debt_to_income_ratio"],
        batch["existing_debt"] / 100.0,
        atol=1e-4,
    )
    np.testing.assert_allclose(
        batch["dependents_adjusted_burden_score"],
        (batch["dependents"] * 10.0) + batch["existing_debt"],
        atol=1e-4,
    )
    np.testing.assert_allclose(
        batch["horizon_adjusted_urgency_score"],
        100.0 * (1.0 - np.minimum(batch["investment_horizon"], 30.0) / 30.0),
        atol=1e-4,
    )
