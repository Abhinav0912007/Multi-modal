"""
Backend configuration: paths, constants, environment variables.
"""

import os

# Resolve project root (one level up from backend/)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
PAIRS_DIR = os.path.join(DATA_DIR, "pairs")
OUTPUTS_DIR = os.path.join(PROJECT_ROOT, "outputs")
ARTIFACTS_DIR = OUTPUTS_DIR

# Ensure output directory exists
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Server settings
HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
PORT = int(os.getenv("BACKEND_PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

# Pipeline defaults
DEFAULT_NFEATURES = 15000
DEFAULT_RATIO_THRESH = 0.75
DEFAULT_RANSAC_THRESH = 3.0
DEFAULT_GRID_SIZE = (8, 8)
