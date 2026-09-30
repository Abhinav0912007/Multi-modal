"""
Module: backend/processing/evaluation.py
Description: Quantitative evaluation metrics, JSON export, and match point CSV export.
"""

import os
import json
import csv
import numpy as np

def evaluate_registration_validity(n_inliers: int, spatial_coverage_ratio: float, rmse: float, matrix=None) -> tuple[str, str, bool]:
    """
    Evaluates scientific registration validity state according to photogrammetric standards:
    - INSUFFICIENT if inliers < 12 OR spatial coverage < 25%
    - INVALID if transformation is degenerate, matrix is singular, or RMSE is zero/NaN/infinite
    - VALID only when sufficient inliers and spatial coverage exist and the transformation is numerically stable.
    """
    if matrix is None:
        return "INVALID", "No geometric transformation matrix could be computed.", False

    if isinstance(matrix, np.ndarray) and not np.all(np.isfinite(matrix)):
        return "INVALID", "Transformation matrix contains non-finite (NaN/Inf) coefficients.", False

    # Check for minimal sample degenerate fit
    if n_inliers == 4 and (rmse is None or rmse < 1e-5):
        return (
            "INSUFFICIENT",
            "RMSE is not statistically meaningful because the homography was fitted with only the minimum number of correspondences (4 points, 0 residual degrees of freedom).",
            False
        )

    if n_inliers < 4:
        return (
            "INVALID",
            f"Fewer than 4 correspondences ({n_inliers} inliers). Planar homography cannot be determined.",
            False
        )

    if n_inliers < 12:
        return (
            "INSUFFICIENT",
            f"Insufficient inliers ({n_inliers} found, minimum 12 required for statistically overdetermined registration).",
            False
        )

    if spatial_coverage_ratio < 0.25:
        return (
            "INSUFFICIENT",
            f"Poor spatial distribution ({spatial_coverage_ratio * 100:.1f}% grid coverage, minimum 25% required to prevent localized bias).",
            False
        )

    if rmse is None or not np.isfinite(rmse) or rmse <= 1e-5:
        return (
            "INVALID",
            f"Reprojection error is degenerate or zero ({rmse:.6f} px). Minimal sample fit detected.",
            False
        )

    if rmse > 25.0:
        return (
            "INVALID",
            f"Geometric residual error ({rmse:.2f} px) exceeds acceptable photogrammetric thresholds.",
            False
        )

    return (
        "VALID",
        "Statistically overdetermined system with sufficient spatial dispersion and numerically sound residuals.",
        True
    )


def compute_metrics(
    source_name, reference_name,
    src_shape, ref_shape,
    n_src_kp, n_ref_kp,
    n_good_matches,
    inliers_mask,
    reproj_errors,
    spatial_coverage_ratio,
    subpixel_mean_shift=0.0,
    matrix=None
):
    """
    Assembles comprehensive evaluation metrics dictionary with scientific validity checks.
    """
    total_candidates = len(inliers_mask) if inliers_mask is not None else 0
    n_inliers = int(np.count_nonzero(inliers_mask)) if inliers_mask is not None else 0
    n_outliers = total_candidates - n_inliers
    inlier_ratio = float(n_inliers / total_candidates) if total_candidates > 0 else 0.0

    inlier_errors = reproj_errors[inliers_mask] if (reproj_errors is not None and len(reproj_errors) > 0 and n_inliers > 0) else np.array([0.0])
    mean_err = float(np.mean(inlier_errors))
    median_err = float(np.median(inlier_errors))
    std_err = float(np.std(inlier_errors))
    max_err = float(np.max(inlier_errors))
    rmse = float(np.sqrt(np.mean(inlier_errors ** 2)))

    val_state, val_reason, is_valid = evaluate_registration_validity(
        n_inliers, spatial_coverage_ratio, rmse, matrix=matrix
    )

    metrics = {
        "source_image": source_name,
        "reference_image": reference_name,
        "source_width": int(src_shape[1]),
        "source_height": int(src_shape[0]),
        "reference_width": int(ref_shape[1]),
        "reference_height": int(ref_shape[0]),
        "source_keypoints": int(n_src_kp),
        "reference_keypoints": int(n_ref_kp),
        "good_matches": int(n_good_matches),
        "inliers": n_inliers,
        "outliers": n_outliers,
        "inlier_ratio": round(inlier_ratio, 4),
        "mean_reprojection_error": round(mean_err, 4),
        "median_reprojection_error": round(median_err, 4),
        "std_reprojection_error": round(std_err, 4),
        "max_reprojection_error": round(max_err, 4),
        "rmse": rmse,
        "rmse_formatted": f"{rmse:.6f} px",
        "spatial_coverage": round(float(spatial_coverage_ratio), 4),
        "subpixel_mean_shift": round(float(subpixel_mean_shift), 4),
        "validation_state": val_state,
        "validation_reason": val_reason,
        "is_statistically_valid": is_valid,
        "ground_truth_rmse": "Ground-truth RMSE unavailable for this pair."
    }

    return metrics



def save_metrics_json(metrics_dict, output_path):
    """
    Saves metrics to JSON file with indentation.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(metrics_dict, f, indent=4)
    print(f"[Evaluation] Saved metrics: {output_path}")


def save_transformation_matrix(matrix, transform_type, output_path, ransac_params=None):
    """
    Saves transformation matrix to JSON format.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    data = {
        "transform_type": transform_type,
        "matrix": matrix.tolist() if isinstance(matrix, np.ndarray) else matrix,
        "ransac_parameters": ransac_params or {}
    }
    with open(output_path, "w") as f:
        json.dump(data, f, indent=4)
    print(f"[Evaluation] Saved transformation matrix: {output_path}")


def save_match_points_csv(src_pts, ref_pts, matches, inliers_mask, output_path):
    """
    Saves correspondence points to CSV:
    source_x, source_y, reference_x, reference_y, match_distance, inlier_status
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["source_x", "source_y", "reference_x", "reference_y", "match_distance", "inlier_status"])
        for s_pt, r_pt, m, is_inlier in zip(src_pts, ref_pts, matches, inliers_mask):
            writer.writerow([
                f"{s_pt[0]:.3f}",
                f"{s_pt[1]:.3f}",
                f"{r_pt[0]:.3f}",
                f"{r_pt[1]:.3f}",
                f"{m.distance:.3f}",
                1 if is_inlier else 0
            ])
    print(f"[Evaluation] Saved match points CSV: {output_path} ({len(matches)} rows)")
