"""Router: /api/preview — Quick ROI preview."""

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
from backend.processing.preprocessing import preprocess_image

router = APIRouter(prefix="/api/preview", tags=["preview"])


class PreviewRequest(BaseModel):
    pair_id: str
    roi_src: list[int] = Field(default=[0, 2000, 0, 2000])
    roi_ref: list[int] = Field(default=[35000, 37000, 60000, 62000])


def _encode_image(img_array) -> str:
    """Encode 8-bit image to base64 PNG string."""
    _, buffer = cv2.imencode(".png", img_array)
    return base64.b64encode(buffer).decode("utf-8")


@router.post("/roi")
def preview_roi(req: PreviewRequest):
    """Quick preview of source and reference ROI crops."""
    pair_dir = os.path.join(PAIRS_DIR, req.pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    # Find source
    tar_path = discover_tar_file(source_dir)
    extracted_dir = os.path.join(source_dir, "extracted")
    if tar_path and (not os.path.exists(extracted_dir) or not os.listdir(extracted_dir)):
        extract_tar_bundle(tar_path, extracted_dir)
    search_dir = extracted_dir if os.path.exists(extracted_dir) and os.listdir(extracted_dir) else source_dir

    src_img_path = None
    src_meta_path = None
    try:
        src_img_path, src_meta_path = scan_for_pds_data(search_dir)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Source scientific raster discovery failed: {e}")

    # Find reference
    ref_tifs = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(ref_dir, "*.img*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(PROJECT_ROOT, "data", "reference", "**", "*.tif*"), recursive=True)

    if not src_img_path:
        raise HTTPException(status_code=404, detail="Primary scientific source product not found on disk")
    if not ref_tifs:
        raise HTTPException(status_code=404, detail="Primary scientific reference product not found on disk")

    try:
        # Full requested ROI bounds
        src_patch, _ = read_pds_image(
            src_img_path, metadata_path=src_meta_path,
            roi_lines=(req.roi_src[0], req.roi_src[1]),
            roi_samples=(req.roi_src[2], req.roi_src[3])
        )
        ref_patch, _ = read_reference_image(
            ref_tifs[0],
            roi=(req.roi_ref[0], req.roi_ref[1],
                 req.roi_ref[2], req.roi_ref[3])
        )
        src_8u = preprocess_image(src_patch)
        ref_8u = preprocess_image(ref_patch)

        # Proportional resize for fast network transmission if patch exceeds preview resolution
        max_preview_dim = 800
        if max(src_8u.shape) > max_preview_dim:
            scale = max_preview_dim / float(max(src_8u.shape))
            new_w = max(10, int(src_8u.shape[1] * scale))
            new_h = max(10, int(src_8u.shape[0] * scale))
            src_8u = cv2.resize(src_8u, (new_w, new_h), interpolation=cv2.INTER_AREA)

        if max(ref_8u.shape) > max_preview_dim:
            scale = max_preview_dim / float(max(ref_8u.shape))
            new_w = max(10, int(ref_8u.shape[1] * scale))
            new_h = max(10, int(ref_8u.shape[0] * scale))
            ref_8u = cv2.resize(ref_8u, (new_w, new_h), interpolation=cv2.INTER_AREA)

        return {
            "source": _encode_image(src_8u),
            "reference": _encode_image(ref_8u),
            "source_shape": list(src_8u.shape),
            "reference_shape": list(ref_8u.shape),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")
