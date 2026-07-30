"""
WealthGenie ML Microservice - Pre-Training Data Validator Test Suite
Tests dataset quality gate checks, missing value detection, constant column detection, and error triggering.
"""

import pytest
import numpy as np
from model.data_validator import PreTrainingDataValidator, DataValidationError


def test_data_validator_passed():
    np.random.seed(42)
    X = np.random.randn(100, 16)
    y = np.random.choice([0, 1, 2, 3, 4, 5], size=100)

    validator = PreTrainingDataValidator(min_class_samples=5)
    report = validator.validate(X, y)
    assert report["status"] == "passed"
    assert len(report["errors"]) == 0


def test_data_validator_constant_column_error():
    np.random.seed(42)
    X = np.random.randn(100, 16)
    X[:, 0] = 5.0  # Constant column at index 0
    y = np.random.choice([0, 1, 2, 3, 4, 5], size=100)

    validator = PreTrainingDataValidator(min_class_samples=5)
    with pytest.raises(DataValidationError) as exc_info:
        validator.validate(X, y)
    assert "Constant zero-variance feature columns" in str(exc_info.value)


def test_data_validator_insufficient_samples_error():
    X = np.random.randn(20, 16)
    y = np.zeros(20)

    validator = PreTrainingDataValidator()
    with pytest.raises(DataValidationError) as exc_info:
        validator.validate(X, y)
    assert "Insufficient samples" in str(exc_info.value)
