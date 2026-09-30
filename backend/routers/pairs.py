import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.services.pair_discovery import get_available_pairs, get_pair_detail
from backend.config import PAIRS_DIR

router = APIRouter(prefix="/api/pairs", tags=["pairs"])


@router.get("")
def list_pairs():
    return get_available_pairs()


@router.get("/{pair_id}")
def get_pair(pair_id: str):
    detail = get_pair_detail(pair_id)
    if not detail["exists"]:
        raise HTTPException(status_code=404, detail=f"Pair '{pair_id}' not found")
    return detail


@router.get("/{pair_id}/source-preview")
def get_pair_source_preview(pair_id: str):
    """Serve the calibrated overview raster for the source sensor strip."""
    pair_dir = os.path.join(PAIRS_DIR, pair_id)
    candidates = [
        os.path.join(pair_dir, "source", "source_preview.png"),
        os.path.join(pair_dir, "source", "preview.png"),
        os.path.join(pair_dir, "source_preview.png"),
    ]
    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return FileResponse(p, media_type="image/png")
    raise HTTPException(status_code=404, detail=f"Source preview image not found for pair {pair_id}")


@router.get("/{pair_id}/reference-preview")
def get_pair_reference_preview(pair_id: str):
    """Serve the calibrated overview raster for the reference lunar mosaic."""
    pair_dir = os.path.join(PAIRS_DIR, pair_id)
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")
    candidates = [
        os.path.join(ref_dir, "reference_preview.png"),
        os.path.join(ref_dir, "preview.png"),
        os.path.join(pair_dir, "reference_preview.png"),
    ]
    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return FileResponse(p, media_type="image/png")
    raise HTTPException(status_code=404, detail=f"Reference preview image not found for pair {pair_id}")

