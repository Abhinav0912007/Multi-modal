"""Router: /api/terrain — Auto-detect valid terrain coordinates in reference GeoTIFF."""

import os
import sys
import glob
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import PAIRS_DIR, PROJECT_ROOT

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.processing.pds_reader import find_valid_reference_window

router = APIRouter(prefix="/api/terrain", tags=["terrain"])


class TerrainRequest(BaseModel):
    pair_id: str


@router.post("/auto-detect")
def auto_detect_terrain(req: TerrainRequest):
    """Scans the reference GeoTIFF to find active lunar terrain coordinates."""
    pair_dir = os.path.join(PAIRS_DIR, req.pair_id)
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    ref_tifs = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(PROJECT_ROOT, "data", "reference", "**", "*.tif*"), recursive=True)
    if not ref_tifs:
        return {"y0": 35000, "y1": 41000, "x0": 60000, "x1": 64000, "note": "Nominal reference window"}

    try:
        y0, y1, x0, x1 = find_valid_reference_window(ref_tifs[0])
        return {"y0": y0, "y1": y1, "x0": x0, "x1": x1}
    except Exception as e:
        # Fallback to nominal scientific reference window
        return {"y0": 35000, "y1": 41000, "x0": 60000, "x1": 64000, "note": f"Nominal terrain fallback: {str(e)}"}
