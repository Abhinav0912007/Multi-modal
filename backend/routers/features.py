"""
Router: /api/features — Scientific Feature Correspondence & SIFT/FLANN Matching Workspace
Provides feature detection, descriptor matching, Lowe's ratio filtering, and RANSAC verification.
"""

import os
import sys
import glob
import base64
import time
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
from backend.processing.feature_matching import detect_sift_features, match_descriptors, extract_matched_coordinates
from backend.processing.spatial_filter import filter_matches_by_spatial_grid, compute_spatial_coverage
from backend.processing.registration import estimate_transformation_ransac
from backend.processing.subpixel import refine_matches_lucas_kanade
from backend.processing.evaluation import evaluate_registration_validity
from backend.services.pair_discovery import get_pair_detail

router = APIRouter(prefix="/api/features", tags=["features"])


class FeatureMatchRequest(BaseModel):
    pair_id: str = "pair_001"
    roi_src: list[int] = Field(default=[0, 2000, 0, 2000])
    roi_ref: list[int] = Field(default=[35000, 37000, 60000, 62000])
    nfeatures: int = Field(default=3000, ge=100, le=30000)
    ratio_thresh: float = Field(default=0.75, ge=0.4, le=0.95)
    ransac_thresh: float = Field(default=3.0, ge=0.5, le=10.0)
    transform_type: str = Field(default="homography")
    max_return_matches: int = Field(default=250, ge=50, le=1000)


def _encode_image(img_array: np.ndarray) -> str:
    """Encodes an 8-bit grayscale array to a base64 PNG data string."""
    _, buffer = cv2.imencode(".png", img_array)
    return base64.b64encode(buffer).decode("utf-8")


def _generate_synthetic_lunar_patch(h=512, w=512, is_ref=False, seed=101) -> np.ndarray:
    """Generates realistic lunar topography for feature extraction when raw files are not on disk."""
    np.random.seed(seed % (2**31 - 1))
    base = np.random.normal(120, 22, (h, w)).astype(np.float32)
    # Add multiple crater rings and ridges
    num_craters = 14 + (seed % 8)
    for i in range(num_craters):
        cx = np.random.randint(40, w - 40)
        cy = np.random.randint(40, h - 40)
        cr = np.random.randint(12, 60)
        y, x = np.ogrid[:h, :w]
        dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        mask = dist <= cr
        base[mask] -= (cr - dist[mask]) * 1.6
        rim = (dist >= cr - 3) & (dist <= cr + 2)
        base[rim] += 38.0
        # Shadow effect from solar azimuth
        shadow = (x > cx) & (dist <= cr + 1) & (dist >= cr - 4)
        base[shadow] -= 25.0

    return np.clip(base, 0, 255).astype(np.uint8)


@router.post("/match")
def match_features(req: FeatureMatchRequest):
    """
    Executes real OpenCV SIFT extraction, FLANN KD-Tree descriptor matching,
    Lowe's ratio test, and RANSAC outlier rejection.
    """
    t_start = time.time()
    pair_dir = os.path.join(PAIRS_DIR, req.pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    # 1. Discover and validate pair metadata
    pair_info = get_pair_detail(req.pair_id)

    # BLOCK INVALID IIRS HYPERSPECTRAL MATCHING (Phase 4)
    if req.pair_id == "pair_002" or pair_info.get("instrument") == "IIRS":
        return {
            "status": "requires_band_extraction",
            "validation_state": "INVALID",
            "validation_reason": "IIRS spectral cube requires band extraction before 2D registration.",
            "is_statistically_valid": False,
            "message": "IIRS spectral cube requires band extraction before 2D registration.",
            "instrument": pair_info.get("instrument", "IIRS"),
            "mission": pair_info.get("mission", "Chandrayaan-2"),
            "source_filename": pair_info.get("source_filename", "ch2_iir_nci_20210115T0628272014_d_img_d32.qub"),
            "reference_filename": pair_info.get("reference_filename", "M1536201804CC.IMG"),
            "reference_status_label": pair_info.get("reference_status_label", "Reference geographic overlap: NOT YET VERIFIED"),
            "source_dimensions": [358973, 1104],
            "reference_dimensions": [10000, 704],
            "source_image": None,
            "reference_image": None,
            "source_keypoints": [],
            "reference_keypoints": [],
            "matches": [],
            "stats": {
                "source_features_count": 0,
                "reference_features_count": 0,
                "candidate_matches_count": 0,
                "verified_matches_count": 0,
                "inliers_count": 0,
                "outliers_count": 0,
                "inlier_ratio": 0.0,
                "mean_reprojection_error": 0.0,
                "rmse": 0.0,
                "rmse_formatted": "N/A (Requires band extraction)",
                "spatial_coverage": 0.0,
                "validation_state": "INVALID",
                "validation_reason": "IIRS spectral cube requires band extraction before 2D registration."
            }
        }

    # Discover source data
    tar_path = discover_tar_file(source_dir)
    extracted_dir = os.path.join(source_dir, "extracted")
    if tar_path and (not os.path.exists(extracted_dir) or not os.listdir(extracted_dir)):
        extract_tar_bundle(tar_path, extracted_dir)
    search_dir = extracted_dir if os.path.exists(extracted_dir) and os.listdir(extracted_dir) else source_dir

    src_img_path, src_meta_path = None, None
    try:
        src_img_path, src_meta_path = scan_for_pds_data(search_dir)
    except Exception:
        pass

    ref_tifs = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tifs:
        ref_tifs = glob.glob(os.path.join(PROJECT_ROOT, "data", "reference", "**", "*.tif*"), recursive=True)

    # Load real scientific rasters
    using_simulated = False
    if src_img_path and ref_tifs:
        try:
            src_raw, (src_lines, src_samples, src_dtype) = read_pds_image(
                src_img_path, metadata_path=src_meta_path,
                roi_lines=(req.roi_src[0], req.roi_src[1]),
                roi_samples=(req.roi_src[2], req.roi_src[3])
            )
            ref_raw, _ = read_reference_image(
                ref_tifs[0],
                roi=(req.roi_ref[0], req.roi_ref[1], req.roi_ref[2], req.roi_ref[3])
            )
        except Exception as e:
            print(f"[Features] PDS read fallback triggered: {e}")
            using_simulated = True
    else:
        using_simulated = True

    if using_simulated:
        h, w = 540, 540
        seed_common = abs(int(req.roi_src[0] * 19 + req.roi_src[2] * 31 + 42))
        src_raw = _generate_synthetic_lunar_patch(h, w, is_ref=False, seed=seed_common)

        M_sim = cv2.getRotationMatrix2D((w / 2, h / 2), 2.8, 1.02)
        M_sim[0, 2] += 12.0
        M_sim[1, 2] -= 8.0
        ref_transformed = cv2.warpAffine(src_raw, M_sim, (w, h), borderMode=cv2.BORDER_REFLECT)
        noise = np.random.normal(0, 4.0, (h, w)).astype(np.float32)
        ref_raw = np.clip(ref_transformed.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    # 2. Scientific Preprocessing (Percentile Normalization + CLAHE)
    src_proc = preprocess_image(src_raw, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)
    ref_proc = preprocess_image(ref_raw, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)

    # 3. Stage 1: FEATURE EXTRACTION (SIFT)
    kp_src, des_src = detect_sift_features(src_proc, nfeatures=req.nfeatures)
    kp_ref, des_ref = detect_sift_features(ref_proc, nfeatures=req.nfeatures)

    n_src_kp = len(kp_src)
    n_ref_kp = len(kp_ref)

    if n_src_kp < 4 or n_ref_kp < 4:
        return {
            "status": "insufficient_matches",
            "validation_state": "INVALID",
            "validation_reason": f"Insufficient keypoints detected (Source: {n_src_kp}, Reference: {n_ref_kp}).",
            "is_statistically_valid": False,
            "message": f"Insufficient keypoints detected (Source: {n_src_kp}, Reference: {n_ref_kp}).",
            "instrument": pair_info.get("instrument", "Unknown"),
            "mission": pair_info.get("mission", "Unknown"),
            "source_filename": pair_info.get("source_filename", ""),
            "reference_filename": pair_info.get("reference_filename", ""),
            "reference_status_label": pair_info.get("reference_status_label", "Reference geographic overlap: NOT YET VERIFIED"),
            "stats": {
                "source_features_count": n_src_kp,
                "reference_features_count": n_ref_kp,
                "candidate_matches_count": 0,
                "verified_matches_count": 0,
                "inliers_count": 0,
                "outliers_count": 0,
                "inlier_ratio": 0.0,
                "mean_reprojection_error": 0.0,
                "rmse": 0.0,
                "rmse_formatted": "0.000000 px",
                "spatial_coverage": 0.0,
                "validation_state": "INVALID",
                "validation_reason": "Insufficient keypoints detected."
            },
            "source_image": _encode_image(src_proc),
            "reference_image": _encode_image(ref_proc),
            "matches": [],
            "source_keypoints": [],
            "reference_keypoints": [],
        }

    # 4. Stage 2: CORRESPONDENCE SEARCH (FLANN + Lowe's Ratio Test)
    good_matches = match_descriptors(des_src, des_ref, matcher_type="FLANN", ratio_thresh=req.ratio_thresh)
    src_pts, ref_pts = extract_matched_coordinates(kp_src, kp_ref, good_matches)

    candidate_count = min(n_src_kp, n_ref_kp)
    verified_count = len(good_matches)

    if verified_count < 4:
        match_items = []
        for idx, m in enumerate(good_matches):
            s_pt = src_pts[idx]
            r_pt = ref_pts[idx]
            match_items.append({
                "id": idx,
                "source_pt": [round(float(s_pt[0]), 2), round(float(s_pt[1]), 2)],
                "ref_pt": [round(float(r_pt[0]), 2), round(float(r_pt[1]), 2)],
                "distance": round(float(m.distance), 3),
                "is_inlier": False,
                "error": round(float(m.distance), 3),
            })

        return {
            "status": "insufficient_matches",
            "validation_state": "INSUFFICIENT",
            "validation_reason": f"Only {verified_count} matches passed Lowe's ratio test (minimum 4 required for geometric model).",
            "is_statistically_valid": False,
            "message": f"Only {verified_count} matches passed Lowe's ratio test (minimum 4 required for geometric model).",
            "instrument": pair_info.get("instrument", "Unknown"),
            "mission": pair_info.get("mission", "Unknown"),
            "source_filename": pair_info.get("source_filename", ""),
            "reference_filename": pair_info.get("reference_filename", ""),
            "reference_status_label": pair_info.get("reference_status_label", "Reference geographic overlap: NOT YET VERIFIED"),
            "stats": {
                "source_features_count": n_src_kp,
                "reference_features_count": n_ref_kp,
                "candidate_matches_count": candidate_count,
                "verified_matches_count": verified_count,
                "inliers_count": 0,
                "outliers_count": verified_count,
                "inlier_ratio": 0.0,
                "mean_reprojection_error": 0.0,
                "rmse": 0.0,
                "rmse_formatted": "0.000000 px",
                "spatial_coverage": 0.0,
                "validation_state": "INSUFFICIENT",
                "validation_reason": "Insufficient verified matches."
            },
            "source_dimensions": [src_proc.shape[0], src_proc.shape[1]],
            "reference_dimensions": [ref_proc.shape[0], ref_proc.shape[1]],
            "source_image": _encode_image(src_proc),
            "reference_image": _encode_image(ref_proc),
            "matches": match_items,
            "source_keypoints": [{"x": round(float(p.pt[0]), 2), "y": round(float(p.pt[1]), 2)} for p in kp_src[:150]],
            "reference_keypoints": [{"x": round(float(p.pt[0]), 2), "y": round(float(p.pt[1]), 2)} for p in kp_ref[:150]],
        }

    # 5. Spatial Regularization (8x8 Grid)
    filt_src_pts, filt_ref_pts, filt_matches, _ = filter_matches_by_spatial_grid(
        src_pts, ref_pts, good_matches, ref_proc.shape,
        grid_size=(8, 8), max_per_cell=30
    )

    # 6. Stage 3: GEOMETRIC VERIFICATION (RANSAC)
    try:
        matrix, inliers_mask, reproj_errors = estimate_transformation_ransac(
            filt_src_pts, filt_ref_pts,
            transform_type=req.transform_type,
            ransac_thresh=req.ransac_thresh,
            max_iters=3000
        )
    except Exception as err:
        return {
            "status": "failed",
            "validation_state": "INVALID",
            "validation_reason": f"Geometric verification failed: {str(err)}",
            "is_statistically_valid": False,
            "message": f"Geometric verification failed: {str(err)}",
            "instrument": pair_info.get("instrument", "Unknown"),
            "mission": pair_info.get("mission", "Unknown"),
            "source_filename": pair_info.get("source_filename", ""),
            "reference_filename": pair_info.get("reference_filename", ""),
            "reference_status_label": pair_info.get("reference_status_label", "Reference geographic overlap: NOT YET VERIFIED"),
            "stats": {
                "source_features_count": n_src_kp,
                "reference_features_count": n_ref_kp,
                "candidate_matches_count": candidate_count,
                "verified_matches_count": verified_count,
                "inliers_count": 0,
                "outliers_count": len(filt_matches),
                "inlier_ratio": 0.0,
                "mean_reprojection_error": 0.0,
                "rmse": 0.0,
                "rmse_formatted": "0.000000 px",
                "spatial_coverage": 0.0,
                "validation_state": "INVALID",
                "validation_reason": str(err)
            },
            "source_image": _encode_image(src_proc),
            "reference_image": _encode_image(ref_proc),
            "matches": [],
            "source_keypoints": [],
            "reference_keypoints": [],
        }

    n_inliers = int(np.count_nonzero(inliers_mask))
    n_outliers = len(inliers_mask) - n_inliers
    inlier_ratio = float(n_inliers / len(inliers_mask)) if len(inliers_mask) > 0 else 0.0

    inlier_errors = reproj_errors[inliers_mask] if n_inliers > 0 else np.array([0.0])
    mean_err = float(np.mean(inlier_errors))
    rmse = float(np.sqrt(np.mean(inlier_errors ** 2)))

    # Spatial coverage evaluation
    spatial_info = compute_spatial_coverage(filt_ref_pts[inliers_mask], ref_proc.shape, grid_size=(8, 8))
    spatial_coverage_ratio = float(spatial_info.get("spatial_coverage_ratio", 0.0))

    # Evaluate scientific validity state (Phase 7)
    val_state, val_reason, is_valid = evaluate_registration_validity(
        n_inliers, spatial_coverage_ratio, rmse, matrix=matrix
    )

    # Assemble structured match correspondences
    match_items = []
    indices = list(range(len(filt_matches)))
    max_display = req.max_return_matches
    if len(indices) > max_display:
        step = max(1, len(indices) // max_display)
        indices = indices[::step][:max_display]

    for idx in indices:
        s_pt = filt_src_pts[idx]
        r_pt = filt_ref_pts[idx]
        m = filt_matches[idx]
        is_inlier = bool(inliers_mask[idx])
        err = float(reproj_errors[idx]) if idx < len(reproj_errors) else 0.0

        match_items.append({
            "id": idx,
            "source_pt": [round(float(s_pt[0]), 2), round(float(s_pt[1]), 2)],
            "ref_pt": [round(float(r_pt[0]), 2), round(float(r_pt[1]), 2)],
            "distance": round(float(m.distance), 3),
            "is_inlier": is_inlier,
            "error": round(err, 3),
        })

    # Sample top keypoints for background visualization
    sample_kp_src = [{"x": round(float(p.pt[0]), 2), "y": round(float(p.pt[1]), 2), "size": round(float(p.size), 1)} for p in kp_src[:250]]
    sample_kp_ref = [{"x": round(float(p.pt[0]), 2), "y": round(float(p.pt[1]), 2), "size": round(float(p.size), 1)} for p in kp_ref[:250]]

    elapsed = round(time.time() - t_start, 2)

    return {
        "status": "completed",
        "elapsed_seconds": elapsed,
        "is_simulated": using_simulated,
        "instrument": pair_info.get("instrument", "Unknown"),
        "mission": pair_info.get("mission", "Unknown"),
        "instrument_name": pair_info.get("instrument_name", f"{pair_info.get('mission', '')} {pair_info.get('instrument', '')}"),
        "source_filename": pair_info.get("source_filename", ""),
        "reference_filename": pair_info.get("reference_filename", ""),
        "reference_status_label": pair_info.get("reference_status_label", "Reference geographic overlap: NOT YET VERIFIED"),
        "validation_state": val_state,
        "validation_reason": val_reason,
        "is_statistically_valid": is_valid,
        "source_dimensions": [src_proc.shape[0], src_proc.shape[1]],
        "reference_dimensions": [ref_proc.shape[0], ref_proc.shape[1]],
        "source_image": _encode_image(src_proc),
        "reference_image": _encode_image(ref_proc),
        "source_keypoints": sample_kp_src,
        "reference_keypoints": sample_kp_ref,
        "matches": match_items,
        "stats": {
            "source_features_count": n_src_kp,
            "reference_features_count": n_ref_kp,
            "candidate_matches_count": candidate_count,
            "verified_matches_count": verified_count,
            "inliers_count": n_inliers,
            "outliers_count": n_outliers,
            "inlier_ratio": round(inlier_ratio, 4),
            "mean_reprojection_error": round(mean_err, 4),
            "rmse": rmse,
            "rmse_formatted": f"{rmse:.6f} px",
            "spatial_coverage": round(spatial_coverage_ratio, 4),
            "validation_state": val_state,
            "validation_reason": val_reason,
            "is_statistically_valid": is_valid,
        },
        "transformation_matrix": matrix.tolist() if isinstance(matrix, np.ndarray) else matrix,
    }
