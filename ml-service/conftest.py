"""
Pytest configuration for ml-service.
Ensures current service root directory is included in sys.path for test imports.
"""

import sys
from pathlib import Path

# Add ml-service root directory to sys.path
ml_service_dir = Path(__file__).resolve().parent
if str(ml_service_dir) not in sys.path:
    sys.path.insert(0, str(ml_service_dir))
