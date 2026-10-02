"""
Router: /api/preprocessing — Scientific Preprocessing Workspace
Provides percentile-based intensity normalization, dynamic range compression,
and CLAHE local contrast enhancement for lunar satellite imagery.
"""

import os
import sys
import glob
import base64
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.config import PAIRS_DIR, PROJECT_ROOT

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.processing.tar_extractor import discover_tar_file, extract_tar_bundle, scan_for_pds_data
from backend.processing.pds_reader import read_pds_image, read_reference_image
from backend.processing.preprocessing import normalize_to_8bit, apply_lunar_clahe

router = APIRouter(prefix="/api/preprocessing", tags=["preprocessing"])


class PreprocessRequest(BaseModel):
    pair_id: str = "pair_001"
    roi_src: list[int] = Field(default=[42000, 46000, 1000, 7000])
    roi_ref: list[int] = Field(default=[3000, 5000, 100, 600])
    enable_normalization: bool = True
    p_low: float = Field(default=1.0, ge=0.0, le=20.0)
    p_high: float = Field(default=99.0, ge=80.0, le=100.0)
    enable_clahe: bool = True
    clip_limit: float = Field(default=2.5, ge=0.5, le=10.0)
    tile_grid_size: int = Field(default=8, ge=2, le=32)


def _encode_image(img_array: np.ndarray) -> str:
    """Encodes an 8-bit array to a base64 PNG data string."""
    _, buffer = cv2.imencode(".png", img_array)
    return base64.b64encode(buffer).decode("utf-8")


def _resize_for_preview(img: np.ndarray, max_dim: int = 800) -> np.ndarray:
    if max(img.shape) > max_dim:
        scale = max_dim / float(max(img.shape))
        new_w = max(10, int(img.shape[1] * scale))
        new_h = max(10, int(img.shape[0] * scale))
        return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return img


@router.post("/process")
def process_rois(req: PreprocessRequest):
    """
    Extracts raw ROI patches for source and reference, generates both
    raw visualization baseline and scientifically enhanced (normalized + CLAHE) products.
    """
    pair_dir = os.path.join(PAIRS_DIR, req.pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    # Discover source
    tar_path = discover_tar_file(source_dir)
    extracted_dir = os.path.join(source_dir, "extracted")
    if tar_path and (not os.path.exists(extracted_dir) or not os.listdir(extracted_dir)):
        extract_tar_bundle(tar_path, extracted_dir)
    search_dir = extracted_dir if os.path.exists(extracted_dir) and os.listdir(extracted_dir) else source_dir

    try:
        src_img_path, src_meta_path = scan_for_pds_data(search_dir)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Source raster discovery failed: {e}")

    # Discover reference
    ref_tifs = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(ref_dir, "*.img*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(PROJECT_ROOT, "data", "reference", "**", "*.tif*"), recursive=True)

    if not src_img_path:
        raise HTTPException(status_code=404, detail="Source PDS image not found")
    if not ref_tifs:
        raise HTTPException(status_code=404, detail="Reference image not found")

    try:
        # Read exact requested ROI bounds using memory mapping
        src_patch, _ = read_pds_image(
            src_img_path,
            metadata_path=src_meta_path,
            roi_lines=(req.roi_src[0], req.roi_src[1]),
            roi_samples=(req.roi_src[2], req.roi_src[3])
        )
        ref_patch, _ = read_reference_image(
            ref_tifs[0],
            roi=(req.roi_ref[0], req.roi_ref[1], req.roi_ref[2], req.roi_ref[3])
        )

        # 1. Raw visual representation (linear stretch baseline for visual comparison)
        src_raw_vis = normalize_to_8bit(src_patch, p_low=0.1, p_high=99.9)
        ref_raw_vis = normalize_to_8bit(ref_patch, p_low=0.1, p_high=99.9)

        # 2. Scientific preprocessing
        # Intensity normalization
        if req.enable_normalization:
            src_proc = normalize_to_8bit(src_patch, p_low=req.p_low, p_high=req.p_high)
            ref_proc = normalize_to_8bit(ref_patch, p_low=req.p_low, p_high=req.p_high)
        else:
            src_proc = src_raw_vis.copy()
            ref_proc = ref_raw_vis.copy()

        # CLAHE local contrast enhancement
        if req.enable_clahe:
            grid = (req.tile_grid_size, req.tile_grid_size)
            src_proc = apply_lunar_clahe(src_proc, clip_limit=req.clip_limit, tile_grid_size=grid)
            ref_proc = apply_lunar_clahe(ref_proc, clip_limit=req.clip_limit, tile_grid_size=grid)

        # 3. Validation
        warning = None
        src_mean = float(np.mean(src_proc))
        ref_mean = float(np.mean(ref_proc))
        src_std = float(np.std(src_proc))
        if src_mean < 8 or src_mean > 248 or src_std < 5:
            warning = "Processed image contains insufficient valid image data."
        elif ref_mean < 8 or ref_mean > 248:
            warning = "Processed reference contains insufficient valid image data."

        # Preview downsampling for fast base64 transfer
        src_raw_prev = _resize_for_preview(src_raw_vis)
        ref_raw_prev = _resize_for_preview(ref_raw_vis)
        src_proc_prev = _resize_for_preview(src_proc)
        ref_proc_prev = _resize_for_preview(ref_proc)

        return {
            "status": "ready",
            "pair_id": req.pair_id,
            "source_raw": _encode_image(src_raw_prev),
            "source_processed": _encode_image(src_proc_prev),
            "reference_raw": _encode_image(ref_raw_prev),
            "reference_processed": _encode_image(ref_proc_prev),
            "source_shape": list(src_patch.shape),
            "reference_shape": list(ref_patch.shape),
            "warning": warning,
            "parameters": {
                "enable_normalization": req.enable_normalization,
                "p_low": req.p_low,
                "p_high": req.p_high,
                "enable_clahe": req.enable_clahe,
                "clip_limit": req.clip_limit,
                "tile_grid_size": req.tile_grid_size,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preprocessing execution failed: {str(e)}")
