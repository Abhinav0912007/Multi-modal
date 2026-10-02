"""
Router: /api/alignment — Interactive Scientific Alignment Studio
Provides endpoints for dual-raster inspection, RANSAC auto-alignment solution extraction,
matrix decomposition (dx, dy, rotation, scale, shear, RMSE), manual transformation warping,
and real-time residual error computation.
"""

import os
import sys
import glob
import math
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
from backend.processing.feature_matching import detect_sift_features, match_descriptors, extract_matched_coordinates
from backend.processing.spatial_filter import filter_matches_by_spatial_grid
from backend.processing.registration import estimate_transformation_ransac, warp_image_to_reference
from backend.processing.subpixel import refine_matches_lucas_kanade

router = APIRouter(prefix="/api/alignment", tags=["alignment"])


class TransformWarpRequest(BaseModel):
    pair_id: str = "pair_001"
    dx: float = Field(default=0.0)
    dy: float = Field(default=0.0)
    rotation_deg: float = Field(default=0.0)
    scale_x: float = Field(default=1.0)
    scale_y: float = Field(default=1.0)
    shear_x: float = Field(default=0.0)
    shear_y: float = Field(default=0.0)
    transform_type: str = Field(default="affine")


def _encode_image(img_array: np.ndarray) -> str:
    """Encodes an 8-bit array to a base64 PNG data string."""
    _, buffer = cv2.imencode(".png", img_array)
    return base64.b64encode(buffer).decode("utf-8")


def _generate_synthetic_lunar_patch(h=512, w=512, seed=101) -> np.ndarray:
    """Generates realistic lunar crater topography for alignment testing."""
    np.random.seed(seed % (2**31 - 1))
    base = np.random.normal(122, 20, (h, w)).astype(np.float32)
    num_craters = 16 + (seed % 6)
    for _ in range(num_craters):
        cx = np.random.randint(45, w - 45)
        cy = np.random.randint(45, h - 45)
        cr = np.random.randint(14, 62)
        y, x = np.ogrid[:h, :w]
        dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        mask = dist <= cr
        base[mask] -= (cr - dist[mask]) * 1.55
        rim = (dist >= cr - 3) & (dist <= cr + 2)
        base[rim] += 36.0
        # Illumination shadowing
        shadow = (x > cx) & (dist <= cr + 1) & (dist >= cr - 4)
        base[shadow] -= 22.0

    return np.clip(base, 0, 255).astype(np.uint8)


def _load_or_synthesize_pair(pair_id: str, roi_src=None, roi_ref=None):
    """Loads actual PDS / GeoTIFF image crops or generates realistic correlated lunar pairs."""
    pair_dir = os.path.join(PAIRS_DIR, pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

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

    if src_img_path and ref_tifs:
        try:
            rs = roi_src or (0, 2000, 0, 2000)
            rr = roi_ref or (35000, 37000, 60000, 62000)
            src_raw, _ = read_pds_image(src_img_path, metadata_path=src_meta_path,
                                        roi_lines=(rs[0], rs[1]), roi_samples=(rs[2], rs[3]))
            ref_raw, _ = read_reference_image(ref_tifs[0], roi=(rr[0], rr[1], rr[2], rr[3]))
            src_proc = preprocess_image(src_raw, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)
            ref_proc = preprocess_image(ref_raw, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)
            return src_proc, ref_proc, False
        except Exception as e:
            print(f"[Alignment API] Fallback to synthetic for {pair_id}: {e}")

    # Synthetic realistic correlated terrain
    h, w = 540, 540
    seed_val = abs(hash(pair_id)) % 100000 + 42
    # Generate common ground lunar terrain
    ground = _generate_synthetic_lunar_patch(h, w, seed=seed_val)

    # Reference has physical lunar satellite offset and slight rotation:
    # dx = 14.5 px, dy = -9.2 px, rot = 2.45 deg, scale = 1.025
    center = (w / 2.0, h / 2.0)
    true_rot = 2.45
    true_scale = 1.025
    true_dx = 14.5
    true_dy = -9.2
    true_kx = 0.015

    # Build affine warp for synthetic reference
    M_affine = cv2.getRotationMatrix2D(center, -true_rot, 1.0 / true_scale)
    M_affine[0, 2] -= true_dx
    M_affine[1, 2] -= true_dy
    # Add shear
    M_shear = np.array([[1.0, -true_kx, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32)
    M_combined = np.vstack([M_affine, [0, 0, 1]]) @ np.vstack([M_shear, [0, 0, 1]])

    src_proc = preprocess_image(ground, p_low=1.0, p_high=99.0, clip_limit=2.2, denoise=True)
    ref_warped = cv2.warpAffine(src_proc, M_combined[:2, :], (w, h), borderMode=cv2.BORDER_REFLECT)
    # Add sensor noise and subtle contrast variation
    noise = np.random.normal(0, 3.5, (h, w)).astype(np.float32)
    ref_proc = np.clip(ref_warped.astype(np.float32) * 0.98 + 4.0 + noise, 0, 255).astype(np.uint8)

    return src_proc, ref_proc, True


def _decompose_affine_matrix(M: np.ndarray, width: int, height: int):
    """
    Decomposes a 2x3 or 3x3 transformation matrix into human-interpretable scientific parameters:
    dx (px), dy (px), rotation (deg), scale_x, scale_y, shear_x, shear_y
    relative to the center of the image.
    """
    if M.shape[0] == 3 and M.shape[1] == 3:
        # Approximate affine from homography near center
        H = M / (M[2, 2] if M[2, 2] != 0 else 1.0)
        cx, cy = width / 2.0, height / 2.0
        # Compute Jacobian at center
        denom = H[2, 0] * cx + H[2, 1] * cy + H[2, 2]
        denom_sq = denom * denom
        a = (H[0, 0] * denom - (H[0, 0] * cx + H[0, 1] * cy + H[0, 2]) * H[2, 0]) / denom_sq
        b = (H[0, 1] * denom - (H[0, 0] * cx + H[0, 1] * cy + H[0, 2]) * H[2, 1]) / denom_sq
        c = (H[1, 0] * denom - (H[1, 0] * cx + H[1, 1] * cy + H[1, 2]) * H[2, 0]) / denom_sq
        d = (H[1, 1] * denom - (H[1, 0] * cx + H[1, 1] * cy + H[1, 2]) * H[2, 1]) / denom_sq

        # Center mapped
        mapped_cx = (H[0, 0] * cx + H[0, 1] * cy + H[0, 2]) / denom
        mapped_cy = (H[1, 0] * cx + H[1, 1] * cy + H[1, 2]) / denom
        dx = mapped_cx - cx
        dy = mapped_cy - cy
    else:
        a, b = float(M[0, 0]), float(M[0, 1])
        c, d = float(M[1, 0]), float(M[1, 1])
        cx, cy = width / 2.0, height / 2.0
        mapped_cx = a * cx + b * cy + float(M[0, 2])
        mapped_cy = c * cx + d * cy + float(M[1, 2])
        dx = mapped_cx - cx
        dy = mapped_cy - cy

    # Scale and rotation from polar decomposition
    sx = math.sqrt(a * a + c * c)
    theta_rad = math.atan2(c, a)
    theta_deg = math.degrees(theta_rad)

    # Undo rotation to find sy and shear
    cos_t = math.cos(theta_rad)
    sin_t = math.sin(theta_rad)
    # R^T * [a b; c d] = [sx, kx * sy; 0, sy]
    b_unrot = -sin_t * a + cos_t * b
    d_unrot = -sin_t * b + cos_t * d
    sy = d_unrot if abs(d_unrot) > 1e-6 else sx
    shear_x = (cos_t * b + sin_t * d) / (sx if sx != 0 else 1.0)
    shear_y = 0.0

    return {
        "dx": round(float(dx), 3),
        "dy": round(float(dy), 3),
        "rotation_deg": round(float(theta_deg), 3),
        "scale_x": round(float(sx), 4),
        "scale_y": round(float(sy), 4),
        "shear_x": round(float(shear_x), 4),
        "shear_y": round(float(shear_y), 4),
    }


def _build_matrix_from_params(width: int, height: int, dx: float, dy: float,
                              rot_deg: float, sx: float, sy: float,
                              kx: float = 0.0, ky: float = 0.0) -> np.ndarray:
    """Builds a 3x3 affine transformation matrix centered on image center."""
    cx, cy = width / 2.0, height / 2.0
    rad = math.radians(rot_deg)
    cos_t = math.cos(rad)
    sin_t = math.sin(rad)

    # Center translation: T_center_inv
    T1 = np.array([
        [1.0, 0.0, -cx],
        [0.0, 1.0, -cy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    # Scale & Shear & Rotation: R * S * K
    M_affine = np.array([
        [cos_t * sx - sin_t * ky * sy, -cos_t * kx * sx - sin_t * sy, 0.0],
        [sin_t * sx + cos_t * ky * sy, -sin_t * kx * sx + cos_t * sy, 0.0],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    # Center back + Delta translation: T_center
    T2 = np.array([
        [1.0, 0.0, cx + dx],
        [0.0, 1.0, cy + dy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    return T2 @ M_affine @ T1


def _compute_alignment_metrics(ref_img: np.ndarray, warped_src: np.ndarray):
    """Calculates RMSE, Mean Absolute Difference, and Normalized Cross Correlation."""
    h = min(ref_img.shape[0], warped_src.shape[0])
    w = min(ref_img.shape[1], warped_src.shape[1])
    r_crop = ref_img[:h, :w]
    w_crop = warped_src[:h, :w]

    mask = (w_crop > 0) & (r_crop > 0)
    valid_count = int(np.count_nonzero(mask))
    if valid_count < 100:
        return {
            "rmse": 99.0,
            "mad": 99.0,
            "ncc": 0.0,
            "overlap_ratio": 0.0,
            "quality_rating": "Poor / No Overlap"
        }

    diff = r_crop[mask].astype(np.float32) - w_crop[mask].astype(np.float32)
    rmse = float(np.sqrt(np.mean(diff ** 2)))
    mad = float(np.mean(np.abs(diff)))

    # Normalized Cross Correlation
    ref_vals = r_crop[mask].astype(np.float32)
    src_vals = w_crop[mask].astype(np.float32)
    ref_norm = ref_vals - np.mean(ref_vals)
    src_norm = src_vals - np.mean(src_vals)
    denom = np.sqrt(np.sum(ref_norm ** 2) * np.sum(src_norm ** 2))
    ncc = float(np.sum(ref_norm * src_norm) / denom) if denom > 1e-7 else 0.0

    overlap_ratio = float(valid_count / (h * w))

    # Quality classification
    if rmse < 12.0 and ncc > 0.85:
        rating = "EXCELLENT • Sub-pixel Registration"
    elif rmse < 22.0 and ncc > 0.70:
        rating = "GOOD • Geometrically Aligned"
    elif rmse < 35.0 and ncc > 0.50:
        rating = "ACCEPTABLE • Coarse Alignment"
    else:
        rating = "SUB-OPTIMAL • Residual Disparity Detected"

    return {
        "rmse": round(rmse, 3),
        "mad": round(mad, 3),
        "ncc": round(ncc, 4),
        "overlap_ratio": round(overlap_ratio, 4),
        "quality_rating": rating
    }


@router.get("/pair/{pair_id}")
def get_alignment_pair(pair_id: str):
    """
    Initializes the Alignment Studio for the target pair.
    Computes SIFT + FLANN + RANSAC auto-alignment solution and returns:
    - Source raster (unaligned)
    - Reference raster
    - Auto-aligned warped result
    - Optimal scientific transformation parameters (dx, dy, rotation, scale, shear)
    - Initial unaligned metrics vs optimal aligned metrics (Before / After)
    - 3x3 Transformation Matrix
    """
    if pair_id == "pair_002":
        return {
            "status": "band_extraction_required",
            "validation_state": "BAND_EXTRACTION_REQUIRED",
            "message": "Alignment cannot proceed: IIRS requires a verified 2D spatial band before geometric model estimation.",
            "source_raster": "",
            "reference_raster": "",
            "warped_raster": "",
            "inliers_count": 0,
            "total_matches": 0,
            "matrix": None,
            "transformation_params": {
                "dx": 0.0,
                "dy": 0.0,
                "rotation_deg": 0.0,
                "scale_x": 1.0,
                "scale_y": 1.0,
                "shear_x": 0.0,
                "shear_y": 0.0
            },
            "initial_metrics": {
                "rmse": 0.0,
                "mad": 0.0,
                "ncc": 0.0,
                "overlap_ratio": 0.0,
                "quality_rating": "N/A — Band Extraction Required"
            },
            "aligned_metrics": {
                "rmse": 0.0,
                "mad": 0.0,
                "ncc": 0.0,
                "overlap_ratio": 0.0,
                "quality_rating": "N/A — Band Extraction Required"
            }
        }

    src_proc, ref_proc, is_sim = _load_or_synthesize_pair(pair_id)
    h, w = ref_proc.shape[:2]

    # Compute keypoints & RANSAC solution
    kp_src, des_src = detect_sift_features(src_proc, nfeatures=4000)
    kp_ref, des_ref = detect_sift_features(ref_proc, nfeatures=4000)

    matrix = None
    inliers_count = 0
    total_matches = 0
    reproj_errs = None
    inliers_mask = None
    decomp = None

    if des_src is not None and des_ref is not None and len(kp_src) >= 4 and len(kp_ref) >= 4:
        good = match_descriptors(des_src, des_ref, matcher_type="FLANN", ratio_thresh=0.75)
        total_matches = len(good)
        if total_matches >= 4:
            s_pts, r_pts = extract_matched_coordinates(kp_src, kp_ref, good)
            try:
                matrix, inliers_mask, reproj_errs = estimate_transformation_ransac(
                    s_pts, r_pts, transform_type="homography", ransac_thresh=3.0
                )
                if inliers_mask is not None:
                    inliers_count = int(np.count_nonzero(inliers_mask))
                if matrix is not None:
                    decomp = _decompose_affine_matrix(matrix, w, h)
            except Exception as e:
                print(f"[Alignment API] RANSAC error: {e}")

    # Honest scientific failure handling: Do not fabricate a transformation matrix
    if matrix is None or inliers_count < 4:
        failure_reason = "Insufficient valid correspondences or degenerate geometry to estimate valid homography."
        if total_matches < 4:
            failure_reason = f"Only {total_matches} verified correspondences were found (minimum 4 required for geometric model)."

        return {
            "status": "failed",
            "validation_state": "ALIGNMENT_FAILED",
            "failure_reason": failure_reason,
            "pair_id": pair_id,
            "is_simulated": is_sim,
            "dimensions": {"width": w, "height": h},
            "source_image": _encode_image(src_proc),
            "reference_image": _encode_image(ref_proc),
            "aligned_image": "",
            "matrix_3x3": None,
            "inliers_count": inliers_count,
            "total_matches": total_matches,
            "auto_parameters": None,
            "before_metrics": _compute_alignment_metrics(ref_proc, src_proc),
            "after_metrics": None,
            "subpixel_refinement": None,
            "minimal_constraint_warning": None,
        }

    # Sub-pixel Refinement (Lucas-Kanade optical patch optimization)
    subpix_info = None
    if inliers_count >= 4 and inliers_mask is not None:
        try:
            inlier_src = s_pts[inliers_mask]
            inlier_ref = r_pts[inliers_mask]
            refined_ref, shifts = refine_matches_lucas_kanade(src_proc, ref_proc, inlier_src, inlier_ref)
            mean_shift = float(np.mean(shifts)) if len(shifts) > 0 else 0.0
            max_shift = float(np.max(shifts)) if len(shifts) > 0 else 0.0
            subpix_info = {
                "executed": True,
                "algorithm": "Lucas-Kanade Optical Gradient Refinement",
                "points_refined": len(refined_ref),
                "mean_subpixel_shift_px": round(mean_shift, 4),
                "max_subpixel_shift_px": round(max_shift, 4),
            }
        except Exception as err:
            subpix_info = {
                "executed": False,
                "error": str(err)
            }

    # Residual validation: Check for minimal homography (4 points produce 0 residual by construction)
    is_minimal = (inliers_count == 4)
    minimal_warning = (
        "Residual is not independently validated because the model is minimally constrained (4 points)."
        if is_minimal else None
    )

    inlier_errors = reproj_errs[inliers_mask] if (reproj_errs is not None and inliers_mask is not None) else np.array([0.0])
    mean_err = float(np.mean(inlier_errors)) if len(inlier_errors) > 0 else 0.0
    rmse_err = float(np.sqrt(np.mean(inlier_errors ** 2))) if len(inlier_errors) > 0 else 0.0
    max_err = float(np.max(inlier_errors)) if len(inlier_errors) > 0 else 0.0

    # Generate authentic warped image using projective perspective warping
    if matrix.shape == (3, 3):
        warped_aligned = cv2.warpPerspective(src_proc, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    else:
        warped_aligned = cv2.warpAffine(src_proc, matrix[:2, :], (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

    # Compute Before metrics (unaligned identity) vs After metrics (optimal alignment)
    before_metrics = _compute_alignment_metrics(ref_proc, src_proc)
    after_metrics = _compute_alignment_metrics(ref_proc, warped_aligned)

    # Base64 encodings
    src_b64 = _encode_image(src_proc)
    ref_b64 = _encode_image(ref_proc)
    aligned_b64 = _encode_image(warped_aligned)

    return {
        "status": "success",
        "validation_state": "VALID_ALIGNMENT",
        "pair_id": pair_id,
        "is_simulated": is_sim,
        "dimensions": {"width": w, "height": h},
        "source_image": src_b64,
        "reference_image": ref_b64,
        "aligned_image": aligned_b64,
        "auto_parameters": decomp,
        "matrix_3x3": matrix.tolist() if isinstance(matrix, np.ndarray) else matrix,
        "inliers_count": inliers_count,
        "total_matches": total_matches,
        "rmse": round(rmse_err, 4),
        "mean_reprojection_error": round(mean_err, 4),
        "max_residual": round(max_err, 4),
        "subpixel_refinement": subpix_info,
        "minimal_constraint_warning": minimal_warning,
        "before_metrics": before_metrics,
        "after_metrics": after_metrics,
    }


@router.post("/warp")
def warp_custom_transformation(req: TransformWarpRequest):
    """
    Applies real-time manual scientific transformation adjustments (dx, dy, rot, scale, shear)
    and computes refreshed residual error metrics.
    """
    if req.pair_id == "pair_002":
        raise HTTPException(
            status_code=400,
            detail="IIRS spatial band extraction required before geometric transformation can be performed."
        )

    src_proc, ref_proc, _ = _load_or_synthesize_pair(req.pair_id)
    h, w = ref_proc.shape[:2]

    # Build 3x3 transformation
    M3 = _build_matrix_from_params(
        width=w, height=h,
        dx=req.dx, dy=req.dy,
        rot_deg=req.rotation_deg,
        sx=req.scale_x, sy=req.scale_y,
        kx=req.shear_x, ky=req.shear_y
    )

    warped = cv2.warpAffine(src_proc, M3[:2, :], (w, h), flags=cv2.INTER_CUBIC,
                            borderMode=cv2.BORDER_CONSTANT, borderValue=0)

    metrics = _compute_alignment_metrics(ref_proc, warped)

    return {
        "status": "success",
        "pair_id": req.pair_id,
        "aligned_image": _encode_image(warped),
        "parameters": {
            "dx": req.dx,
            "dy": req.dy,
            "rotation_deg": req.rotation_deg,
            "scale_x": req.scale_x,
            "scale_y": req.scale_y,
            "shear_x": req.shear_x,
            "shear_y": req.shear_y,
        },
        "matrix_3x3": M3.tolist(),
        "metrics": metrics
    }
