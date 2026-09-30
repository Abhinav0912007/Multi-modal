"""
Lunar Image Registration System - Main Orchestrator
Usage:
    python main.py --pair pair_001
"""

import os
import sys
import argparse
import glob
import numpy as np
import cv2

# Add workspace root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.processing.tar_extractor import discover_tar_file, extract_tar_bundle, scan_for_pds_data
from backend.processing.pds_reader import read_pds_image, read_reference_image, find_valid_reference_window
from backend.processing.preprocessing import preprocess_image
from backend.processing.feature_matching import detect_sift_features, match_descriptors, extract_matched_coordinates
from backend.processing.spatial_filter import filter_matches_by_spatial_grid, compute_spatial_coverage
from backend.processing.registration import estimate_transformation_ransac, warp_image_to_reference
from backend.processing.subpixel import refine_keypoints_subpixel, refine_matches_lucas_kanade
from backend.processing.evaluation import compute_metrics, save_metrics_json, save_transformation_matrix, save_match_points_csv
from backend.processing.visualization import (
    save_image, draw_matches_side_by_side, draw_spatial_distribution_grid,
    create_blended_overlay, create_checkerboard
)


def run_pipeline(pair_id="pair_001", roi_source=(0, 6000), roi_ref=None, transform_type="homography", grid_size=(8, 8), nfeatures=15000):
    print("=" * 70)
    print(f" LUNAR IMAGE REGISTRATION PROTOTYPE — PAIR: {pair_id}")
    print("=" * 70)

    base_dir = PROJECT_ROOT
    pair_dir = os.path.join(base_dir, "data", "pairs", pair_id)
    source_dir = os.path.join(pair_dir, "source")
    
    # Handle both 'reference' and 'refrence' spelling
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    out_dir = os.path.join(base_dir, "outputs", pair_id)
    os.makedirs(out_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # STEP 1: SOURCE TAR EXTRACTION & PDS DISCOVERY
    # ------------------------------------------------------------------
    print("\n[STEP 1] Inspecting Source Archive...")
    tar_path = discover_tar_file(source_dir)
    extracted_dir = os.path.join(source_dir, "extracted")

    if tar_path:
        print(f"Found TAR Archive: {tar_path}")
        if not os.path.exists(extracted_dir) or not os.listdir(extracted_dir):
            extract_tar_bundle(tar_path, extracted_dir)
        else:
            print(f"Source files already extracted in: {extracted_dir}")
        src_img_path, src_meta_path = scan_for_pds_data(extracted_dir)
    else:
        # Check if already extracted
        src_img_path, src_meta_path = scan_for_pds_data(source_dir)

    # ------------------------------------------------------------------
    # STEP 2: DISCOVER REFERENCE TIFF
    # ------------------------------------------------------------------
    print("\n[STEP 2] Inspecting Reference GeoTIFF...")
    ref_tif_files = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tif_files:
        # Search parent data/reference directory recursively
        ref_tif_files = glob.glob(os.path.join(base_dir, "data", "reference", "**", "*.tif*"), recursive=True)
    if not ref_tif_files:
        # Check if reference is an .img or other format
        ref_tif_files = glob.glob(os.path.join(ref_dir, "*.*"))
        ref_tif_files = [f for f in ref_tif_files if not f.endswith(".tar")]
    if not ref_tif_files:
        raise FileNotFoundError(f"No reference files found in: {ref_dir} or {os.path.join(base_dir, 'data', 'reference')}")
    ref_tif_path = ref_tif_files[0]
    print(f"Discovered Reference Image: {ref_tif_path}")


    # ------------------------------------------------------------------
    # STEP 3: READ SOURCE & REFERENCE DATA
    # ------------------------------------------------------------------
    print("\n[STEP 3] Reading Source and Reference Rasters...")
    src_patch, (src_lines, src_samples, src_dtype) = read_pds_image(
        src_img_path, metadata_path=src_meta_path,
        roi_lines=roi_source, roi_samples=(0, 4000)
    )
    print(f"Loaded Source Patch Shape: {src_patch.shape}, Dtype: {src_dtype}")

    # Determine reference ROI
    target_h = (roi_source[1] - roi_source[0]) if roi_source else 6000
    target_w = 4000
    if roi_ref is None:
        print("[Reference Reader] Auto-detecting active lunar terrain window in reference GeoTIFF...")
        roi_ref = find_valid_reference_window(ref_tif_path, target_h=target_h, target_w=target_w)
        print(f"[Reference Reader] Selected Reference Window: Y=[{roi_ref[0]}:{roi_ref[1]}], X=[{roi_ref[2]}:{roi_ref[3]}]")

    ref_patch, (ref_shape, ref_dtype) = read_reference_image(
        ref_tif_path,
        roi=roi_ref
    )
    
    # If the loaded reference patch is completely dark/empty, fallback to auto-detection
    if np.count_nonzero(ref_patch > 0) < (ref_patch.size * 0.05):
        print("[Reference Reader] Selected reference region was blank. Auto-detecting valid coordinates...")
        roi_ref = find_valid_reference_window(ref_tif_path, target_h=target_h, target_w=target_w)
        ref_patch, (ref_shape, ref_dtype) = read_reference_image(ref_tif_path, roi=roi_ref)

    print(f"Loaded Reference Patch Shape: {ref_patch.shape}, Dtype: {ref_dtype}")

    # ------------------------------------------------------------------
    # STEP 4: PREPROCESSING & ENHANCEMENT
    # ------------------------------------------------------------------
    print("\n[STEP 4] Preprocessing (Percentile Scaling + CLAHE)...")
    src_proc = preprocess_image(src_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)
    ref_proc = preprocess_image(ref_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)

    save_image(src_proc, os.path.join(out_dir, "source_processed.png"))
    save_image(ref_proc, os.path.join(out_dir, "reference_processed.png"))

    # ------------------------------------------------------------------
    # STEP 5: SIFT FEATURE DETECTION
    # ------------------------------------------------------------------
    print("\n[STEP 5] SIFT Feature Extraction...")
    kp_src, des_src = detect_sift_features(src_proc, nfeatures=nfeatures)
    kp_ref, des_ref = detect_sift_features(ref_proc, nfeatures=nfeatures)

    # ------------------------------------------------------------------
    # STEP 6: FEATURE MATCHING (FLANN + Lowe's Ratio)
    # ------------------------------------------------------------------
    print("\n[STEP 6] Feature Matching (FLANN + Lowe's Ratio Test)...")
    good_matches = match_descriptors(des_src, des_ref, matcher_type="FLANN", ratio_thresh=0.75)
    src_pts, ref_pts = extract_matched_coordinates(kp_src, kp_ref, good_matches)

    # Draw all good matches
    matches_vis = draw_matches_side_by_side(src_proc, kp_src, ref_proc, kp_ref, good_matches)
    save_image(matches_vis, os.path.join(out_dir, "good_matches.png"))

    if len(good_matches) < 4:
        print("[Error] Insufficient matches found for registration.")
        return

    # ------------------------------------------------------------------
    # STEP 7: UNIFORM SPATIAL FILTERING (8x8 Grid)
    # ------------------------------------------------------------------
    print(f"\n[STEP 7] Spatial Filtering across {grid_size[0]}x{grid_size[1]} Grid...")
    filt_src_pts, filt_ref_pts, filt_matches, _ = filter_matches_by_spatial_grid(
        src_pts, ref_pts, good_matches, ref_proc.shape, grid_size=grid_size, max_per_cell=30
    )

    # ------------------------------------------------------------------
    # STEP 8: RANSAC OUTLIER REJECTION & TRANSFORMATION ESTIMATION
    # ------------------------------------------------------------------
    print(f"\n[STEP 8] Estimating {transform_type.upper()} with RANSAC...")
    matrix, inliers_mask, reproj_errors = estimate_transformation_ransac(
        filt_src_pts, filt_ref_pts,
        transform_type=transform_type,
        ransac_thresh=3.0,
        max_iters=3000
    )

    inlier_src_pts = filt_src_pts[inliers_mask]
    inlier_ref_pts = filt_ref_pts[inliers_mask]

    # Save Inlier Matches visualization
    inlier_vis = draw_matches_side_by_side(src_proc, kp_src, ref_proc, kp_ref, filt_matches, inliers_mask=inliers_mask)
    save_image(inlier_vis, os.path.join(out_dir, "inlier_matches.png"))

    # ------------------------------------------------------------------
    # STEP 9: SUB-PIXEL REFINEMENT
    # ------------------------------------------------------------------
    print("\n[STEP 9] Sub-Pixel Refinement (Lucas-Kanade Patch Optimization)...")
    refined_ref_pts, subpix_shifts = refine_matches_lucas_kanade(
        src_proc, ref_proc, inlier_src_pts, inlier_ref_pts
    )
    mean_subpix_shift = float(np.mean(subpix_shifts)) if len(subpix_shifts) > 0 else 0.0

    # Re-estimate transformation using refined sub-pixel coordinates
    matrix_refined = matrix
    if len(refined_ref_pts) >= 4:
        try:
            matrix_refined, _, reproj_errors_ref = estimate_transformation_ransac(
                inlier_src_pts, refined_ref_pts, transform_type=transform_type, ransac_thresh=2.5
            )
        except Exception as err:
            print(f"[Warning] Sub-pixel re-estimation failed ({err}), falling back to standard RANSAC matrix.")
            matrix_refined = matrix


    # ------------------------------------------------------------------
    # STEP 10: SPATIAL COVERAGE & EVALUATION
    # ------------------------------------------------------------------
    print("\n[STEP 10] Spatial Distribution Analysis & Metrics...")
    spatial_info = compute_spatial_coverage(inlier_ref_pts, ref_proc.shape, grid_size=grid_size)
    draw_spatial_distribution_grid(ref_proc, inlier_ref_pts, grid_size=grid_size, output_path=os.path.join(out_dir, "spatial_distribution.png"))

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
        subpixel_mean_shift=mean_subpix_shift
    )
    save_metrics_json(metrics, os.path.join(out_dir, "metrics.json"))
    save_transformation_matrix(matrix_refined, transform_type, os.path.join(out_dir, "transformation_matrix.json"))
    save_match_points_csv(filt_src_pts, filt_ref_pts, filt_matches, inliers_mask, os.path.join(out_dir, "match_points.csv"))

    # ------------------------------------------------------------------
    # STEP 11: WARPING & REGISTRATION
    # ------------------------------------------------------------------
    print("\n[STEP 11] Warping Source to Reference Coordinate System...")
    registered_src = warp_image_to_reference(src_proc, matrix_refined, ref_proc.shape, transform_type=transform_type)
    save_image(registered_src, os.path.join(out_dir, "registered.png"))

    # ------------------------------------------------------------------
    # STEP 12: VISUAL VALIDATION (OVERLAY & CHECKERBOARD)
    # ------------------------------------------------------------------
    print("\n[STEP 12] Creating Blended Overlay & Checkerboard for Alignment Verification...")
    blend_50_50, color_overlay = create_blended_overlay(ref_proc, registered_src, alpha=0.5)
    save_image(blend_50_50, os.path.join(out_dir, "overlay.png"))
    
    checker = create_checkerboard(ref_proc, registered_src, square_size=128)
    save_image(checker, os.path.join(out_dir, "checkerboard.png"))

    print("\n" + "=" * 70)
    print(" REGISTRATION PIPELINE COMPLETED SUCCESSFULLY!")
    print(f" Inliers:         {metrics['inliers']} / {metrics['good_matches']} ({metrics['inlier_ratio']*100:.2f}%)")
    print(f" Mean Reproj Err: {metrics['mean_reprojection_error']} pixels")
    print(f" Spatial Coverage:{metrics['spatial_coverage']*100:.1f}%")
    print(f" Outputs saved in: {out_dir}")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lunar Image Registration Prototype")
    parser.add_argument("--pair", type=str, default="pair_001", help="Pair folder name under data/pairs/")
    parser.add_argument("--transform", type=str, default="homography", choices=["homography", "affine"], help="Geometric transformation model")
    parser.add_argument("--nfeatures", type=int, default=15000, help="Max SIFT features")
    args = parser.parse_args()

    run_pipeline(
        pair_id=args.pair,
        transform_type=args.transform,
        nfeatures=args.nfeatures
    )
