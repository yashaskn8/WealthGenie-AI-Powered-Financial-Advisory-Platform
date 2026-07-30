"""
WealthGenie ML Microservice - Pre-Training Data Validation Gate
Validates datasets before model training to detect missing values, duplicates, class imbalance, and anomalies.
"""

import logging
from typing import Dict, Any, Tuple, List
import numpy as np

logger = logging.getLogger("wealthgenie.data_validator")


class DataValidationError(ValueError):
    """Raised when a dataset fails critical validation quality checks."""
    pass


class PreTrainingDataValidator:
    """Rigorous pre-training data validation gate for production ML pipelines."""

    def __init__(self, max_missing_ratio: float = 0.05, max_duplicate_ratio: float = 0.10, min_class_samples: int = 10):
        self.max_missing_ratio = max_missing_ratio
        self.max_duplicate_ratio = max_duplicate_ratio
        self.min_class_samples = min_class_samples

    def validate(self, X: np.ndarray, y: np.ndarray, feature_names: List[str] = None) -> Dict[str, Any]:
        """
        Runs comprehensive quality checks on feature matrix X and target array y.
        Returns a validation report. Raises DataValidationError if critical checks fail.
        """
        report: Dict[str, Any] = {"status": "passed", "errors": [], "warnings": [], "checks": {}}
        num_samples, num_features = X.shape

        # 1. Dimensionality check
        if num_samples < 50:
            report["errors"].append(f"Insufficient samples: {num_samples} < 50 minimum required.")

        if len(y) != num_samples:
            report["errors"].append(f"Feature/target length mismatch: X={num_samples}, y={len(y)}.")

        # 2. Missing Value Check
        nan_count = int(np.isnan(X).sum())
        nan_ratio = nan_count / (num_samples * num_features)
        report["checks"]["missing_value_ratio"] = round(nan_ratio, 4)
        if nan_ratio > self.max_missing_ratio:
            report["errors"].append(f"Excessive missing values: {nan_ratio:.2%} > {self.max_missing_ratio:.2%} max.")

        # 3. Duplicate Rows Check
        unique_rows = np.unique(X, axis=0)
        duplicate_count = num_samples - len(unique_rows)
        duplicate_ratio = duplicate_count / num_samples
        report["checks"]["duplicate_ratio"] = round(duplicate_ratio, 4)
        if duplicate_ratio > self.max_duplicate_ratio:
            report["warnings"].append(f"High duplicate ratio: {duplicate_ratio:.2%}.")

        # 4. Constant Columns Check
        variances = np.nanvar(X, axis=0)
        constant_cols = np.where(variances == 0.0)[0].tolist()
        report["checks"]["constant_column_indices"] = constant_cols
        if constant_cols:
            report["errors"].append(f"Constant zero-variance feature columns detected at indices: {constant_cols}.")

        # 5. Class Imbalance Check
        unique_classes, class_counts = np.unique(y, return_counts=True)
        class_distribution = {int(cls): int(cnt) for cls, cnt in zip(unique_classes, class_counts)}
        report["checks"]["class_distribution"] = class_distribution

        min_count = min(class_counts)
        if min_count < self.min_class_samples:
            report["errors"].append(f"Class imbalance error: class with only {min_count} samples (< {self.min_class_samples} min).")

        # 6. Extreme Outliers Check (IQR method)
        q25 = np.percentile(X, 25, axis=0)
        q75 = np.percentile(X, 75, axis=0)
        iqr = q75 - q25
        outlier_mask = (X < (q25 - 5.0 * iqr)) | (X > (q75 + 5.0 * iqr))
        outlier_count = int(outlier_mask.sum())
        report["checks"]["outlier_count"] = outlier_count

        # Final Status Decision
        if report["errors"]:
            report["status"] = "failed"
            error_msg = f"Data validation failed with {len(report['errors'])} critical errors: {report['errors']}"
            logger.error(error_msg)
            raise DataValidationError(error_msg)

        logger.info(f"Data validation PASSED successfully for {num_samples} samples across {num_features} features.")
        return report
