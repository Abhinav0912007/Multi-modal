"""
Pipeline Service: Orchestrates the full registration pipeline in a background thread.
Extracted from app.py run_pipeline_execution — all st.* calls removed, replaced with callback-based progress.
"""

import os
import sys
import glob
import time
import numpy as np
import cv2

from backend.config import PROJECT_ROOT, PAIRS_DIR, OUTPUTS_DIR

# Add project root to path so processing modules can be imported
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.processing.tar_extractor import discover_tar_file, extract_tar_bundle, scan_for_pds_data
from backend.processing.pds_reader import read_pds_image, read_reference_image, find_valid_reference_window
from backend.processing.preprocessing import preprocess_image
from backend.processing.feature_matching import detect_sift_features, match_descriptors, extract_matched_coordinates
from backend.processing.spatial_filter import filter_matches_by_spatial_grid, compute_spatial_coverage
from backend.processing.registration import estimate_transformation_ransac, warp_image_to_reference
from backend.processing.subpixel import refine_matches_lucas_kanade
from backend.processing.evaluation import compute_metrics, save_metrics_json, save_transformation_matrix, save_match_points_csv
from backend.processing.visualization import (
    draw_matches_side_by_side, draw_spatial_distribution_grid,
    create_blended_overlay, create_checkerboard, save_image
)


def run_pipeline(config, progress_callback=None):
    """
    Executes the full registration pipeline.

    Args:
        config: PipelineConfig dataclass
        progress_callback: callable(step, progress, message) for progress updates

    Returns:
        dict with metrics, matrix, artifacts list
    """
    def report(step, progress, message):
        if progress_callback:
            progress_callback(step, progress, message)
        print(f"[Step {step}/10] ({progress}%) {message}")

    pair_dir = os.path.join(PAIRS_DIR, config.pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    out_dir = os.path.join(OUTPUTS_DIR, config.pair_id)
    os.makedirs(out_dir, exist_ok=True)

    if config.pair_id == "pair_002":
        raise ValueError("IIRS spatial band extraction required before pipeline registration can be executed. Raw hyperspectral cube cannot be registered without extracted 2D spatial raster.")

    t_start = time.time()

    # ── Step 1: Discover Source ──────────────────────────────────────
    report(1, 10, "Discovering & inspecting source archive (.img / .tar / 2D band)...")
    tar_path = discover_tar_file(source_dir)
    extracted_dir = os.path.join(source_dir, "extracted")
    if tar_path:
        if not os.path.exists(extracted_dir) or not os.listdir(extracted_dir):
            extract_tar_bundle(tar_path, extracted_dir)
        src_img_path, src_meta_path = scan_for_pds_data(extracted_dir)
    else:
        source_tif_candidate = os.path.join(source_dir, "source.tif")
        if os.path.exists(source_tif_candidate):
            src_img_path, src_meta_path = source_tif_candidate, None
        else:
            src_img_path, src_meta_path = scan_for_pds_data(source_dir)

    # ── Step 2: Discover Reference ───────────────────────────────────
    report(2, 20, "Scanning reference GeoTIFF...")
    ref_tif_files = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tif_files:
        ref_tif_files = glob.glob(os.path.join(PROJECT_ROOT, "data", "reference", "**", "*.tif*"), recursive=True)
    if not ref_tif_files:
        ref_tif_files = [f for f in glob.glob(os.path.join(ref_dir, "*.*")) if not f.endswith(".tar")]
    if not ref_tif_files:
        raise FileNotFoundError(f"No reference files found in: {ref_dir}")
    ref_tif_path = ref_tif_files[0]

    # ── Step 3: Read Rasters with ROI ────────────────────────────────
    roi_src = config.roi_src
    roi_ref = config.roi_ref
    report(3, 30, f"Memory-mapping source & reference patches (ROI: {roi_src}, {roi_ref})...")

    if src_img_path and src_img_path.lower().endswith((".tif", ".tiff", ".png", ".jpg")):
        src_patch, (src_shape, src_dtype) = read_reference_image(src_img_path, roi=roi_src)
        src_lines, src_samples = src_shape[:2]
    else:
        src_patch, (src_lines, src_samples, src_dtype) = read_pds_image(
            src_img_path, metadata_path=src_meta_path,
            roi_lines=(roi_src[0], roi_src[1]),
            roi_samples=(roi_src[2], roi_src[3])
        )
    ref_patch, (ref_shape, ref_dtype) = read_reference_image(ref_tif_path, roi=roi_ref)

    # ── Step 4: Preprocessing (CLAHE + Percentile) ───────────────────
    report(4, 40, "Enhancing lunar contrast (percentile scaling + CLAHE)...")
    src_proc = preprocess_image(src_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)
    ref_proc = preprocess_image(ref_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)

    if np.count_nonzero(ref_proc > 0) < (ref_proc.size * 0.05):
        report(4, 42, "Auto-detecting active lunar terrain window in reference GeoTIFF...")
        roi_ref = find_valid_reference_window(ref_tif_path, target_h=(roi_src[1] - roi_src[0]), target_w=4000)
        ref_patch, (ref_shape, ref_dtype) = read_reference_image(ref_tif_path, roi=roi_ref)
        ref_proc = preprocess_image(ref_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)

    save_image(src_proc, os.path.join(out_dir, "source_processed.png"))
    save_image(ref_proc, os.path.join(out_dir, "reference_processed.png"))

    # ── Step 5: SIFT Feature Extraction ──────────────────────────────
    report(5, 50, f"Detecting SIFT keypoints (max: {config.nfeatures})...")
    kp_src, des_src = detect_sift_features(src_proc, nfeatures=config.nfeatures)
    kp_ref, des_ref = detect_sift_features(ref_proc, nfeatures=config.nfeatures)

    # ── Step 6: Feature Matching ─────────────────────────────────────
    report(6, 60, "FLANN feature matching & Lowe's ratio test...")
    good_matches = match_descriptors(des_src, des_ref, matcher_type="FLANN", ratio_thresh=config.ratio_thresh)
    src_pts, ref_pts = extract_matched_coordinates(kp_src, kp_ref, good_matches)
    matches_vis = draw_matches_side_by_side(src_proc, kp_src, ref_proc, kp_ref, good_matches)
    save_image(matches_vis, os.path.join(out_dir, "good_matches.png"))

    if len(good_matches) < 4:
        raise ValueError(
            f"INSUFFICIENT CORRESPONDENCES: Only {len(good_matches)} verified correspondences were found between source and reference. "
            f"A minimum of 4 spatially distributed correspondences are required for geometric model estimation. "
            f"Please adjust ROI or preprocessing parameters."
        )

    # ── Step 7: Spatial Grid Filtering ───────────────────────────────
    grid_size = config.grid_size
    report(7, 70, f"Spatial grid filtering ({grid_size[0]}x{grid_size[1]} grid)...")
    filt_src_pts, filt_ref_pts, filt_matches, _ = filter_matches_by_spatial_grid(
        src_pts, ref_pts, good_matches, ref_proc.shape, grid_size=grid_size, max_per_cell=30
    )

    # ── Step 8: RANSAC Transformation Estimation ─────────────────────
    report(8, 80, f"Estimating {config.transform_type.upper()} with RANSAC outlier rejection...")
    matrix, inliers_mask, reproj_errors = estimate_transformation_ransac(
        filt_src_pts, filt_ref_pts,
        transform_type=config.transform_type,
        ransac_thresh=config.ransac_thresh,
        max_iters=3000
    )
    inlier_src_pts = filt_src_pts[inliers_mask]
    inlier_ref_pts = filt_ref_pts[inliers_mask]

    inlier_vis = draw_matches_side_by_side(src_proc, kp_src, ref_proc, kp_ref, filt_matches, inliers_mask=inliers_mask)
    save_image(inlier_vis, os.path.join(out_dir, "inlier_matches.png"))

    # ── Step 9: Sub-Pixel Refinement ─────────────────────────────────
    mean_subpix_shift = 0.0
    matrix_refined = matrix
    if config.do_subpixel:
        report(9, 88, "Sub-pixel refinement (Lucas-Kanade patch optimization)...")
        refined_ref_pts, subpix_shifts = refine_matches_lucas_kanade(
            src_proc, ref_proc, inlier_src_pts, inlier_ref_pts
        )
        mean_subpix_shift = float(np.mean(subpix_shifts)) if len(subpix_shifts) > 0 else 0.0
        if len(refined_ref_pts) >= 4:
            matrix_refined, _, _ = estimate_transformation_ransac(
                inlier_src_pts, refined_ref_pts,
                transform_type=config.transform_type,
                ransac_thresh=config.ransac_thresh * 0.8
            )
    else:
        report(9, 88, "Sub-pixel refinement skipped.")

    # ── Step 10: Warping, Metrics & Visualizations ───────────────────
    report(10, 92, "Warping source raster & generating alignment overlays...")
    spatial_info = compute_spatial_coverage(inlier_ref_pts, ref_proc.shape, grid_size=grid_size)
    draw_spatial_distribution_grid(
        ref_proc, inlier_ref_pts, grid_size=grid_size,
        output_path=os.path.join(out_dir, "spatial_distribution.png")
    )

    metrics = compute_metrics(
        source_name=os.path.basename(src_img_path),
        reference_name=os.path.basename(ref_tif_path),
        src_shape=src_proc.shape,
        ref_shape=ref_proc.shape,
        n_src_kp=len(kp_src),
        n_ref_kp=len(kp_ref),
        n_good_matches=len(good_matches),
        inliers_mask=inliers_mask,
        reproj_errors=reproj_errors,
        spatial_coverage_ratio=spatial_info["spatial_coverage_ratio"],
        subpixel_mean_shift=mean_subpix_shift,
        matrix=matrix_refined
    )
    save_metrics_json(metrics, os.path.join(out_dir, "metrics.json"))
    save_transformation_matrix(matrix_refined, config.transform_type, os.path.join(out_dir, "transformation_matrix.json"))
    save_match_points_csv(filt_src_pts, filt_ref_pts, filt_matches, inliers_mask, os.path.join(out_dir, "match_points.csv"))

    registered_src = warp_image_to_reference(src_proc, matrix_refined, ref_proc.shape, transform_type=config.transform_type)
    save_image(registered_src, os.path.join(out_dir, "registered.png"))

    blend_50_50, color_overlay = create_blended_overlay(ref_proc, registered_src, alpha=0.5)
    save_image(blend_50_50, os.path.join(out_dir, "overlay.png"))

    checker = create_checkerboard(ref_proc, registered_src, square_size=128)
    save_image(checker, os.path.join(out_dir, "checkerboard.png"))

    elapsed = time.time() - t_start
    metrics["pipeline_elapsed_seconds"] = round(elapsed, 2)

    # Collect artifact filenames
    artifacts = [f for f in os.listdir(out_dir) if os.path.isfile(os.path.join(out_dir, f))]

    report(10, 100, f"Pipeline complete in {elapsed:.2f}s — Inliers: {metrics['inliers']}/{metrics['good_matches']}")

    return {
        "metrics": metrics,
        "matrix": matrix_refined,
        "artifacts": sorted(artifacts),
    }
