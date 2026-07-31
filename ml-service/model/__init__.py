"""
WealthGenie Core ML Package
Contains ML models, training scripts, data validation, and feature engineering.
"""

import sys
from pathlib import Path

_ml_service_dir = str(Path(__file__).resolve().parent.parent)
if _ml_service_dir not in sys.path:
    sys.path.insert(0, _ml_service_dir)

