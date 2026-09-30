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

    # Generate synthetic realistic lunar patch fallback if files are not on disk
    def _create_synthetic_lunar_patch(h=400, w=400, is_ref=False, seed=None):
        if seed is None:
            seed = 42 if is_ref else 101
        np.random.seed(seed % (2**31 - 1))
        base = np.random.normal(120, 25, (h, w)).astype(np.float32)
        # Add craters
        num_craters = 6 + (seed % 6)
        for _ in range(num_craters):
            cx, cy = np.random.randint(40, w - 40), np.random.randint(40, h - 40)
            cr = np.random.randint(15, 65)
            y, x = np.ogrid[:h, :w]
            dist = np.sqrt((x - cx)**2 + (y - cy)**2)
            mask = dist <= cr
            base[mask] -= (cr - dist[mask]) * 1.5
            rim = (dist >= cr - 3) & (dist <= cr + 2)
            base[rim] += 32
        return np.clip(base, 0, 255).astype(np.uint8)

    src_img_path = None
    src_meta_path = None
    try:
        src_img_path, src_meta_path = scan_for_pds_data(search_dir)
    except Exception:
        pass

    # Find reference
    ref_tifs = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(PROJECT_ROOT, "data", "reference", "**", "*.tif*"), recursive=True)

    if not src_img_path or not ref_tifs:
        s_seed = abs(int(req.roi_src[0] * 31 + req.roi_src[2] * 17 + 101))
        r_seed = abs(int(req.roi_ref[0] * 31 + req.roi_ref[2] * 17 + 202))
        src_synth = _create_synthetic_lunar_patch(400, 400, is_ref=False, seed=s_seed)
        ref_synth = _create_synthetic_lunar_patch(400, 400, is_ref=True, seed=r_seed)
        return {
            "source": _encode_image(src_synth),
            "reference": _encode_image(ref_synth),
            "source_shape": [req.roi_src[1] - req.roi_src[0], req.roi_src[3] - req.roi_src[2]],
            "reference_shape": [req.roi_ref[1] - req.roi_ref[0], req.roi_ref[3] - req.roi_ref[2]],
            "simulated": True
        }

    try:
        src_patch, _ = read_pds_image(
            src_img_path, metadata_path=src_meta_path,
            roi_lines=(req.roi_src[0], min(req.roi_src[0] + 2000, req.roi_src[1])),
            roi_samples=(req.roi_src[2], min(req.roi_src[2] + 2000, req.roi_src[3]))
        )
        ref_patch, _ = read_reference_image(
            ref_tifs[0],
            roi=(req.roi_ref[0], min(req.roi_ref[0] + 2000, req.roi_ref[1]),
                 req.roi_ref[2], min(req.roi_ref[2] + 2000, req.roi_ref[3]))
        )
        src_8u = preprocess_image(src_patch)
        ref_8u = preprocess_image(ref_patch)

        return {
            "source": _encode_image(src_8u),
            "reference": _encode_image(ref_8u),
            "source_shape": list(src_8u.shape),
            "reference_shape": list(ref_8u.shape),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")
