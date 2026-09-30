"""
Chandrayaan-1 TMC Lunar Image Registration System - Streamlit Dashboard
Interactive UI for multi-sensor lunar image registration, feature matching,
spatial distribution analysis, sub-pixel refinement, and alignment verification.
"""

import os
import sys
import glob
import json
import time
import subprocess
import numpy as np
import cv2
import pandas as pd
import streamlit as st
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Add project root to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from src.tar_extractor import discover_tar_file, extract_tar_bundle, scan_for_pds_data
from src.pds_reader import read_pds_image, read_reference_image, find_valid_reference_window
from src.preprocessing import preprocess_image
from src.feature_matching import detect_sift_features, match_descriptors, extract_matched_coordinates
from src.spatial_filter import filter_matches_by_spatial_grid, compute_spatial_coverage
from src.registration import estimate_transformation_ransac, warp_image_to_reference
from src.subpixel import refine_matches_lucas_kanade
from src.evaluation import compute_metrics, save_metrics_json, save_transformation_matrix, save_match_points_csv
from src.visualization import (
    draw_matches_side_by_side, draw_spatial_distribution_grid,
    create_blended_overlay, create_checkerboard, save_image
)

# -----------------------------------------------------------------------------
# Streamlit Page Configuration & Theme
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="ISRO Chandrayaan-1 TMC Registration",
    page_icon="🌖",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom High-Tech Lunar Styling
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }
    
    .main-header {
        background: linear-gradient(135deg, #0b111e 0%, #172554 50%, #030712 100%);
        padding: 24px;
        border-radius: 16px;
        border: 1px solid rgba(56, 189, 248, 0.25);
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
        margin-bottom: 24px;
    }
    
    .badge-chip {
        display: inline-block;
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border: 1px solid rgba(56, 189, 248, 0.4);
        margin-right: 8px;
    }

    .kpi-card {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
        transition: transform 0.2s, border-color 0.2s;
    }
    .kpi-card:hover {
        transform: translateY(-2px);
        border-color: #38bdf8;
    }
    .kpi-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: #38bdf8;
        font-family: 'JetBrains Mono', monospace;
    }
    .kpi-label {
        font-size: 0.85rem;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: 4px;
    }

    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        height: 48px;
        border-radius: 8px 8px 0px 0px;
        padding: 0 16px;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)


# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
def get_available_pairs():
    pairs_dir = os.path.join(BASE_DIR, "data", "pairs")
    if os.path.exists(pairs_dir):
        pairs = [d for d in os.listdir(pairs_dir) if os.path.isdir(os.path.join(pairs_dir, d)) and not d.startswith(".")]
        if pairs:
            return sorted(pairs)
    return ["pair_001"]


def load_existing_metrics(pair_id):
    metrics_path = os.path.join(BASE_DIR, "outputs", pair_id, "metrics.json")
    if os.path.exists(metrics_path):
        try:
            with open(metrics_path, "r") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def run_pipeline_execution(pair_id, roi_src, roi_ref, transform_type, nfeatures, ratio_thresh, grid_size, ransac_thresh, do_subpixel):
    """Executes the registration pipeline with UI progress updates."""
    status_box = st.empty()
    progress_bar = st.progress(0)
    
    pair_dir = os.path.join(BASE_DIR, "data", "pairs", pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    out_dir = os.path.join(BASE_DIR, "outputs", pair_id)
    os.makedirs(out_dir, exist_ok=True)

    t_start = time.time()

    # Step 1: Discover Source
    status_box.info("Step 1/10: Discovering & Inspecting Source Archive (.img / .tar)...")
    progress_bar.progress(10)
    tar_path = discover_tar_file(source_dir)
    extracted_dir = os.path.join(source_dir, "extracted")
    if tar_path:
        if not os.path.exists(extracted_dir) or not os.listdir(extracted_dir):
            extract_tar_bundle(tar_path, extracted_dir)
        src_img_path, src_meta_path = scan_for_pds_data(extracted_dir)
    else:
        src_img_path, src_meta_path = scan_for_pds_data(source_dir)

    # Step 2: Discover Reference
    status_box.info("Step 2/10: Scanning Reference GeoTIFF...")
    progress_bar.progress(20)
    ref_tif_files = glob.glob(os.path.join(ref_dir, "*.tif*"))
    if not ref_tif_files:
        ref_tif_files = glob.glob(os.path.join(BASE_DIR, "data", "reference", "**", "*.tif*"), recursive=True)
    if not ref_tif_files:
        ref_tif_files = glob.glob(os.path.join(ref_dir, "*.*"))
        ref_tif_files = [f for f in ref_tif_files if not f.endswith(".tar")]
    if not ref_tif_files:
        raise FileNotFoundError(f"No reference files found in: {ref_dir} or data/reference")
    ref_tif_path = ref_tif_files[0]


    # Step 3: Read Rasters with ROI
    status_box.info(f"Step 3/10: Memory-mapping Source & Reference patches (ROI: {roi_src}, {roi_ref})...")
    progress_bar.progress(30)
    src_patch, (src_lines, src_samples, src_dtype) = read_pds_image(
        src_img_path, metadata_path=src_meta_path,
        roi_lines=(roi_src[0], roi_src[1]),
        roi_samples=(roi_src[2], roi_src[3])
    )
    ref_patch, (ref_shape, ref_dtype) = read_reference_image(
        ref_tif_path,
        roi=roi_ref
    )

    # Step 4: Preprocessing (CLAHE + Percentile)
    status_box.info("Step 4/10: Enhancing Lunar Contrast (Percentile scaling + CLAHE)...")
    progress_bar.progress(40)
    src_proc = preprocess_image(src_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)
    ref_proc = preprocess_image(ref_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)

    if np.count_nonzero(ref_proc > 0) < (ref_proc.size * 0.05):
        status_box.info("Auto-detecting active lunar terrain window in reference GeoTIFF...")
        roi_ref = find_valid_reference_window(ref_tif_path, target_h=(roi_src[1] - roi_src[0]), target_w=4000)
        ref_patch, (ref_shape, ref_dtype) = read_reference_image(ref_tif_path, roi=roi_ref)
        ref_proc = preprocess_image(ref_patch, p_low=1.0, p_high=99.0, clip_limit=2.5, denoise=True)

    save_image(src_proc, os.path.join(out_dir, "source_processed.png"))
    save_image(ref_proc, os.path.join(out_dir, "reference_processed.png"))


    # Step 5: SIFT Feature Extraction
    status_box.info(f"Step 5/10: Detecting SIFT keypoints (Max: {nfeatures})...")
    progress_bar.progress(50)
    kp_src, des_src = detect_sift_features(src_proc, nfeatures=nfeatures)
    kp_ref, des_ref = detect_sift_features(ref_proc, nfeatures=nfeatures)

    # Step 6: Feature Matching
    status_box.info("Step 6/10: FLANN Feature Matching & Lowe's Ratio Test...")
    progress_bar.progress(60)
    good_matches = match_descriptors(des_src, des_ref, matcher_type="FLANN", ratio_thresh=ratio_thresh)
    src_pts, ref_pts = extract_matched_coordinates(kp_src, kp_ref, good_matches)
    matches_vis = draw_matches_side_by_side(src_proc, kp_src, ref_proc, kp_ref, good_matches)
    save_image(matches_vis, os.path.join(out_dir, "good_matches.png"))

    if len(good_matches) < 4:
        status_box.error("Insufficient matches found for geometric registration. Try increasing SIFT features or adjusting ROI.")
        progress_bar.progress(100)
        return None

    # Step 7: Spatial Grid Filtering
    status_box.info(f"Step 7/10: Spatial Grid Filtering ({grid_size[0]}x{grid_size[1]} grid)...")
    progress_bar.progress(70)
    filt_src_pts, filt_ref_pts, filt_matches, _ = filter_matches_by_spatial_grid(
        src_pts, ref_pts, good_matches, ref_proc.shape, grid_size=grid_size, max_per_cell=30
    )

    # Step 8: RANSAC Transformation Estimation
    status_box.info(f"Step 8/10: Estimating {transform_type.upper()} with RANSAC outlier rejection...")
    progress_bar.progress(80)
    matrix, inliers_mask, reproj_errors = estimate_transformation_ransac(
        filt_src_pts, filt_ref_pts,
        transform_type=transform_type,
        ransac_thresh=ransac_thresh,
        max_iters=3000
    )
    inlier_src_pts = filt_src_pts[inliers_mask]
    inlier_ref_pts = filt_ref_pts[inliers_mask]

    inlier_vis = draw_matches_side_by_side(src_proc, kp_src, ref_proc, kp_ref, filt_matches, inliers_mask=inliers_mask)
    save_image(inlier_vis, os.path.join(out_dir, "inlier_matches.png"))

    # Step 9: Sub-Pixel Refinement
    mean_subpix_shift = 0.0
    matrix_refined = matrix
    if do_subpixel:
        status_box.info("Step 9/10: Sub-Pixel Refinement (Lucas-Kanade Patch Optimization)...")
        refined_ref_pts, subpix_shifts = refine_matches_lucas_kanade(
            src_proc, ref_proc, inlier_src_pts, inlier_ref_pts
        )
        mean_subpix_shift = float(np.mean(subpix_shifts)) if len(subpix_shifts) > 0 else 0.0
        if len(refined_ref_pts) >= 4:
            matrix_refined, _, _ = estimate_transformation_ransac(
                inlier_src_pts, refined_ref_pts, transform_type=transform_type, ransac_thresh=ransac_thresh * 0.8
            )

    progress_bar.progress(90)

    # Step 10: Warping, Metrics & Visualizations
    status_box.info("Step 10/10: Warping Source Raster & Generating Alignment Overlays...")
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

    registered_src = warp_image_to_reference(src_proc, matrix_refined, ref_proc.shape, transform_type=transform_type)
    save_image(registered_src, os.path.join(out_dir, "registered.png"))

    blend_50_50, color_overlay = create_blended_overlay(ref_proc, registered_src, alpha=0.5)
    save_image(blend_50_50, os.path.join(out_dir, "overlay.png"))
    
    checker = create_checkerboard(ref_proc, registered_src, square_size=128)
    save_image(checker, os.path.join(out_dir, "checkerboard.png"))

    elapsed = time.time() - t_start
    progress_bar.progress(100)
    status_box.success(f"Pipeline finished in {elapsed:.2f}s! Inliers: {metrics['inliers']}/{metrics['good_matches']} ({metrics['inlier_ratio']*100:.1f}%) | Reproj RMSE: {metrics['mean_reprojection_error']:.3f} px")

    # Store into session state for immediate interactive rendering
    st.session_state["last_run_pair"] = pair_id
    st.session_state["metrics"] = metrics
    st.session_state["matrix"] = matrix_refined
    st.session_state["src_proc"] = src_proc
    st.session_state["ref_proc"] = ref_proc
    st.session_state["registered_src"] = registered_src
    st.session_state["inlier_ref_pts"] = inlier_ref_pts
    st.session_state["reproj_errors"] = reproj_errors
    st.session_state["inliers_mask"] = inliers_mask
    st.session_state["filt_src_pts"] = filt_src_pts
    st.session_state["filt_ref_pts"] = filt_ref_pts

    return metrics


# -----------------------------------------------------------------------------
# Top Header & Mission Badge
# -----------------------------------------------------------------------------
st.markdown("""
<div class="main-header">
    <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
            <span class="badge-chip">🛰️ ISRO Chandrayaan-1 TMC</span>
            <span class="badge-chip">🔬 Sub-Pixel Registration</span>
            <span class="badge-chip">⚡ Memory-Mapped I/O</span>
            <h1 style="color: #f8fafc; margin: 12px 0 4px 0; font-size: 2rem; font-weight: 700;">
                Lunar Image Registration System
            </h1>
            <p style="color: #94a3b8; margin: 0; font-size: 0.95rem;">
                Precision geometric alignment of PDS3/PDS4 calibrated Terrain Mapping Camera (TMC) strips to Derived Ortho Reference GeoTIFFs.
            </p>
        </div>
        <div style="font-size: 3.5rem; filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.4));">
            🌕
        </div>
    </div>
</div>
""", unsafe_allow_html=True)


# -----------------------------------------------------------------------------
# Sidebar Configuration
# -----------------------------------------------------------------------------
with st.sidebar:
    st.header("⚙️ Pipeline Configuration")
    
    available_pairs = get_available_pairs()
    selected_pair = st.selectbox("Select Lunar Data Pair", available_pairs, index=0)

    st.markdown("---")
    st.subheader("🎯 Region of Interest (ROI)")
    
    # Initialize session state defaults for ROI if not set or zero
    if f"roi_init_{selected_pair}" not in st.session_state:
        ref_dir_check = os.path.join(BASE_DIR, "data", "pairs", selected_pair, "reference")
        if not os.path.exists(ref_dir_check):
            ref_dir_check = os.path.join(BASE_DIR, "data", "pairs", selected_pair, "refrence")
        ref_tifs = glob.glob(os.path.join(ref_dir_check, "*.tif*")) or glob.glob(os.path.join(BASE_DIR, "data", "reference", "**", "*.tif*"), recursive=True)
        if ref_tifs:
            try:
                ay0, ay1, ax0, ax1 = find_valid_reference_window(ref_tifs[0])
                st.session_state["ref_y0"] = ay0
                st.session_state["ref_y1"] = ay1
                st.session_state["ref_x0"] = ax0
                st.session_state["ref_x1"] = ax1
            except Exception:
                st.session_state["ref_y0"] = 35000
                st.session_state["ref_y1"] = 41000
                st.session_state["ref_x0"] = 60000
                st.session_state["ref_x1"] = 64000
        else:
            st.session_state["ref_y0"] = 0
            st.session_state["ref_y1"] = 6000
            st.session_state["ref_x0"] = 0
            st.session_state["ref_x1"] = 4000
        st.session_state[f"roi_init_{selected_pair}"] = True

    if "ref_y0" not in st.session_state:
        st.session_state["ref_y0"] = 35000
    if "ref_y1" not in st.session_state:
        st.session_state["ref_y1"] = 41000
    if "ref_x0" not in st.session_state:
        st.session_state["ref_x0"] = 60000
    if "ref_x1" not in st.session_state:
        st.session_state["ref_x1"] = 64000

    col_auto1, col_auto2 = st.columns(2)
    with col_auto1:
        if st.button("🔍 Auto-Find Terrain", help="Automatically scans the GeoTIFF to locate active lunar surface coordinates"):
            ref_dir_check = os.path.join(BASE_DIR, "data", "pairs", selected_pair, "reference")
            if not os.path.exists(ref_dir_check):
                ref_dir_check = os.path.join(BASE_DIR, "data", "pairs", selected_pair, "refrence")
            ref_tifs = glob.glob(os.path.join(ref_dir_check, "*.tif*")) or glob.glob(os.path.join(BASE_DIR, "data", "reference", "**", "*.tif*"), recursive=True)
            if ref_tifs:
                with st.spinner("Scanning GeoTIFF for active lunar terrain..."):
                    ay0, ay1, ax0, ax1 = find_valid_reference_window(ref_tifs[0])
                    st.session_state["ref_y0"] = ay0
                    st.session_state["ref_y1"] = ay1
                    st.session_state["ref_x0"] = ax0
                    st.session_state["ref_x1"] = ax1
                    st.success(f"Terrain Found: Y[{ay0}:{ay1}], X[{ax0}:{ax1}]")
                    st.rerun()

    with col_auto2:
        preview_btn = st.button("👁️ Preview ROI", help="Quickly preview Source & Reference crops before running")

    col_roi1, col_roi2 = st.columns(2)
    with col_roi1:
        src_line_min = st.number_input("Src Line Start", min_value=0, max_value=500000, value=0, step=500)
        src_line_max = st.number_input("Src Line End", min_value=100, max_value=500000, value=6000, step=500)
    with col_roi2:
        src_samp_min = st.number_input("Src Sample Start", min_value=0, max_value=50000, value=0, step=500)
        src_samp_max = st.number_input("Src Sample End", min_value=100, max_value=50000, value=4000, step=500)

    col_ref1, col_ref2 = st.columns(2)
    with col_ref1:
        ref_y0 = st.number_input("Ref Y0", min_value=0, max_value=500000, value=st.session_state["ref_y0"], step=500)
        ref_y1 = st.number_input("Ref Y1", min_value=100, max_value=500000, value=st.session_state["ref_y1"], step=500)
    with col_ref2:
        ref_x0 = st.number_input("Ref X0", min_value=0, max_value=500000, value=st.session_state["ref_x0"], step=500)
        ref_x1 = st.number_input("Ref X1", min_value=100, max_value=500000, value=st.session_state["ref_x1"], step=500)

    st.session_state["ref_y0"] = ref_y0
    st.session_state["ref_y1"] = ref_y1
    st.session_state["ref_x0"] = ref_x0
    st.session_state["ref_x1"] = ref_x1

    if preview_btn:
        st.markdown("**Quick ROI Preview:**")
        pair_d = os.path.join(BASE_DIR, "data", "pairs", selected_pair)
        s_dir = os.path.join(pair_d, "source")
        r_dir = os.path.join(pair_d, "reference")
        if not os.path.exists(r_dir):
            r_dir = os.path.join(pair_d, "refrence")
        s_tar = discover_tar_file(s_dir)
        ext_d = os.path.join(s_dir, "extracted")
        if s_tar and (not os.path.exists(ext_d) or not os.listdir(ext_d)):
            extract_tar_bundle(s_tar, ext_d)
        s_img, s_meta = scan_for_pds_data(ext_d if os.path.exists(ext_d) and os.listdir(ext_d) else s_dir)
        r_tifs = glob.glob(os.path.join(r_dir, "*.tif*")) or glob.glob(os.path.join(BASE_DIR, "data", "reference", "**", "*.tif*"), recursive=True)
        if s_img and r_tifs:
            try:
                sp, _ = read_pds_image(s_img, metadata_path=s_meta, roi_lines=(src_line_min, min(src_line_min+2000, src_line_max)), roi_samples=(src_samp_min, min(src_samp_min+2000, src_samp_max)))
                rp, _ = read_reference_image(r_tifs[0], roi=(ref_y0, min(ref_y0+2000, ref_y1), ref_x0, min(ref_x0+2000, ref_x1)))
                sp_8u = preprocess_image(sp)
                rp_8u = preprocess_image(rp)
                c_prev1, c_prev2 = st.columns(2)
                c_prev1.image(sp_8u, caption="Src Crop", use_container_width=True)
                c_prev2.image(rp_8u, caption="Ref Crop", use_container_width=True)
            except Exception as ex:
                st.error(f"Preview error: {ex}")

    st.markdown("---")
    st.subheader("🧬 Feature & Geometric Model")

    
    transform_type = st.selectbox("Transformation Model", ["homography", "affine"], index=0)
    nfeatures = st.slider("Max SIFT Keypoints", min_value=2000, max_value=30000, value=15000, step=1000)
    ratio_thresh = st.slider("Lowe's Ratio Threshold", min_value=0.5, max_value=0.9, value=0.75, step=0.05)
    ransac_thresh = st.slider("RANSAC Inlier Threshold (px)", min_value=1.0, max_value=8.0, value=3.0, step=0.5)
    
    grid_dim = st.selectbox("Spatial Grid Size", ["8x8", "6x6", "10x10", "12x12"], index=0)
    grid_val = int(grid_dim.split("x")[0])
    
    do_subpixel = st.checkbox("Enable Lucas-Kanade Sub-Pixel Refinement", value=True)

    st.markdown("---")
    run_btn = st.button("🚀 Run Full Pipeline", type="primary", use_container_width=True)

    st.markdown("---")
    st.subheader("💻 CLI Direct Execution")
    cli_btn = st.button("▶️ Execute main.py Subprocess", use_container_width=True)


# -----------------------------------------------------------------------------
# Trigger Pipeline Execution if Requested
# -----------------------------------------------------------------------------
if run_btn:
    with st.spinner("Processing Lunar Registration Pipeline..."):
        run_pipeline_execution(
            pair_id=selected_pair,
            roi_src=(src_line_min, src_line_max, src_samp_min, src_samp_max),
            roi_ref=(ref_y0, ref_y1, ref_x0, ref_x1),
            transform_type=transform_type,
            nfeatures=nfeatures,
            ratio_thresh=ratio_thresh,
            grid_size=(grid_val, grid_val),
            ransac_thresh=ransac_thresh,
            do_subpixel=do_subpixel
        )

# Trigger CLI main.py execution
if cli_btn:
    st.subheader("🖥️ CLI Execution Stream (`main.py`)")
    cmd = [sys.executable, "main.py", "--pair", selected_pair, "--transform", transform_type, "--nfeatures", str(nfeatures)]
    terminal_output = st.empty()
    with st.spinner(f"Running: {' '.join(cmd)}..."):
        try:
            res = subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True, check=False)
            output_text = res.stdout + "\n" + res.stderr
            terminal_output.code(output_text, language="bash")
            if res.returncode == 0:
                st.success("`main.py` finished successfully!")
            else:
                st.error(f"`main.py` exited with code {res.returncode}")
        except Exception as e:
            st.error(f"Execution failed: {e}")


# -----------------------------------------------------------------------------
# Load Existing Outputs or Session State
# -----------------------------------------------------------------------------
out_dir = os.path.join(BASE_DIR, "outputs", selected_pair)
metrics = st.session_state.get("metrics") or load_existing_metrics(selected_pair)

# -----------------------------------------------------------------------------
# Telemetry Metric Cards
# -----------------------------------------------------------------------------
if metrics:
    m_col1, m_col2, m_col3, m_col4, m_col5, m_col6 = st.columns(6)
    with m_col1:
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-value">{metrics.get('inliers', 0)}</div>
            <div class="kpi-label">RANSAC Inliers</div>
        </div>
        """, unsafe_allow_html=True)
    with m_col2:
        inlier_ratio_pct = metrics.get('inlier_ratio', 0) * 100
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-value">{inlier_ratio_pct:.1f}%</div>
            <div class="kpi-label">Inlier Ratio</div>
        </div>
        """, unsafe_allow_html=True)
    with m_col3:
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-value">{metrics.get('mean_reprojection_error', 0):.3f} <span style="font-size:0.9rem;">px</span></div>
            <div class="kpi-label">Mean Reproj Error</div>
        </div>
        """, unsafe_allow_html=True)
    with m_col4:
        cov_pct = metrics.get('spatial_coverage', 0) * 100
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-value">{cov_pct:.1f}%</div>
            <div class="kpi-label">Spatial Coverage</div>
        </div>
        """, unsafe_allow_html=True)
    with m_col5:
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-value">{metrics.get('subpixel_mean_shift', 0):.3f} <span style="font-size:0.9rem;">px</span></div>
            <div class="kpi-label">Subpixel Shift</div>
        </div>
        """, unsafe_allow_html=True)
    with m_col6:
        st.markdown(f"""
        <div class="kpi-card">
            <div class="kpi-value">{metrics.get('good_matches', 0)}</div>
            <div class="kpi-label">Good Matches</div>
        </div>
        """, unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# Main Tabs Interface
# -----------------------------------------------------------------------------
tab_overview, tab_matches, tab_spatial, tab_alignment, tab_matrix, tab_downloads = st.tabs([
    "📊 Pipeline Overview",
    "🔗 Feature Correspondences",
    "🌐 Spatial Grid & Inlier Density",
    "🌓 Interactive Alignment Studio",
    "📐 Transformation Matrix & Math",
    "💾 Export & Artifacts"
])

# -----------------------------------------------------------------------------
# TAB 1: PIPELINE OVERVIEW & PREPROCESSED PATCHES
# -----------------------------------------------------------------------------
with tab_overview:
    st.subheader("🖼️ Processed Source vs Reference Imagery")
    
    src_proc_path = os.path.join(out_dir, "source_processed.png")
    ref_proc_path = os.path.join(out_dir, "reference_processed.png")
    
    col_img1, col_img2 = st.columns(2)
    with col_img1:
        if os.path.exists(src_proc_path):
            st.image(src_proc_path, caption="Enhanced Source Patch (PDS Calibrated + CLAHE)", use_container_width=True)
        else:
            st.info("Run the pipeline to generate preprocessed source raster.")
            
    with col_img2:
        if os.path.exists(ref_proc_path):
            st.image(ref_proc_path, caption="Enhanced Reference Patch (GeoTIFF Ortho + CLAHE)", use_container_width=True)
        else:
            st.info("Run the pipeline to generate preprocessed reference raster.")

    if metrics:
        st.markdown("### 📋 Detailed Registration Telemetry")
        df_metrics = pd.DataFrame([{
            "Metric": k.replace("_", " ").title(),
            "Value": str(v)
        } for k, v in metrics.items()])
        st.dataframe(df_metrics, use_container_width=True, hide_index=True)


# -----------------------------------------------------------------------------
# TAB 2: FEATURE CORRESPONDENCES
# -----------------------------------------------------------------------------
with tab_matches:
    st.subheader("🎯 Matched Keypoints & RANSAC Outlier Rejection")
    
    inlier_match_path = os.path.join(out_dir, "inlier_matches.png")
    good_match_path = os.path.join(out_dir, "good_matches.png")
    
    col_m1, col_m2 = st.columns(2)
    with col_m1:
        st.markdown("**All Good Matches (FLANN + Lowe's Ratio)**")
        if os.path.exists(good_match_path):
            st.image(good_match_path, use_container_width=True)
        else:
            st.info("No match visualization found.")
            
    with col_m2:
        st.markdown("**Inlier Matches after RANSAC (Green = Inlier, Red = Outlier)**")
        if os.path.exists(inlier_match_path):
            st.image(inlier_match_path, use_container_width=True)
        else:
            st.info("No inlier match visualization found.")

    csv_path = os.path.join(out_dir, "match_points.csv")
    if os.path.exists(csv_path):
        st.markdown("### 📑 Correspondence Points Coordinates Table")
        df_pts = pd.read_csv(csv_path)
        st.dataframe(df_pts.head(200), use_container_width=True)
        st.caption(f"Showing up to first 200 of {len(df_pts)} correspondence points.")


# -----------------------------------------------------------------------------
# TAB 3: SPATIAL GRID & INLIER DENSITY
# -----------------------------------------------------------------------------
with tab_spatial:
    st.subheader("🌐 Uniform Spatial Distribution Analysis")
    
    spatial_path = os.path.join(out_dir, "spatial_distribution.png")
    
    col_sp1, col_sp2 = st.columns([1.5, 1])
    with col_sp1:
        if os.path.exists(spatial_path):
            st.image(spatial_path, caption="Spatial Inlier Density over Reference Terrain", use_container_width=True)
        else:
            st.info("Spatial grid plot not found. Run pipeline.")
            
    with col_sp2:
        st.markdown("""
        #### 📌 Spatial Coverage Rationale
        In lunar terrain, feature clustering frequently occurs around high-contrast crater rims, while smooth mare regions remain sparse. 
        
        Our **Uniform Spatial Grid Filter**:
        - Divides the image into an $8 \\times 8$ grid.
        - Enforces an upper bound of matches per cell.
        - Prevents ill-conditioned homography estimation caused by localized feature clumps.
        - Guarantees geometric fidelity across the entire lunar surface.
        """)
        if metrics:
            st.metric("Spatial Grid Coverage", f"{metrics.get('spatial_coverage', 0)*100:.1f}%")
            st.metric("Sub-Pixel Lucas-Kanade Mean Shift", f"{metrics.get('subpixel_mean_shift', 0):.4f} px")


# -----------------------------------------------------------------------------
# TAB 4: INTERACTIVE ALIGNMENT STUDIO
# -----------------------------------------------------------------------------
with tab_alignment:
    st.subheader("🌓 Interactive Alignment & Registration Verification")
    
    reg_path = os.path.join(out_dir, "registered.png")
    ref_path = os.path.join(out_dir, "reference_processed.png")
    
    if os.path.exists(reg_path) and os.path.exists(ref_path):
        ref_img = cv2.imread(ref_path, cv2.IMREAD_GRAYSCALE)
        reg_img = cv2.imread(reg_path, cv2.IMREAD_GRAYSCALE)
        
        if ref_img is not None and reg_img is not None:
            # Harmonize dimensions if required
            if ref_img.shape != reg_img.shape:
                reg_img = cv2.resize(reg_img, (ref_img.shape[1], ref_img.shape[0]))

            mode = st.radio("Verification View Mode", [
                "Interactive Alpha Crossfade",
                "False-Color Anaglyph Overlay",
                "Interactive Checkerboard Pattern",
                "Absolute Pixel Difference Heatmap"
            ], horizontal=True)
            
            if mode == "Interactive Alpha Crossfade":
                alpha = st.slider("Warped Source Opacity (Alpha)", min_value=0.0, max_value=1.0, value=0.5, step=0.05)
                blend = cv2.addWeighted(ref_img, 1.0 - alpha, reg_img, alpha, 0)
                st.image(blend, caption=f"Alpha Blend: {int((1-alpha)*100)}% Reference + {int(alpha*100)}% Registered Source", use_container_width=True)
                
            elif mode == "False-Color Anaglyph Overlay":
                st.markdown("🟢 **Green Channel** = Reference GeoTIFF | 🟣 **Magenta Channel** = Warped Source")
                overlay = np.zeros((ref_img.shape[0], ref_img.shape[1], 3), dtype=np.uint8)
                overlay[:, :, 1] = ref_img
                overlay[:, :, 0] = reg_img
                overlay[:, :, 2] = reg_img
                st.image(overlay, caption="False-Color Multi-Sensor Composite", use_container_width=True)
                
            elif mode == "Interactive Checkerboard Pattern":
                sq_size = st.slider("Checkerboard Tile Size (px)", min_value=32, max_value=256, value=128, step=16)
                checker = create_checkerboard(ref_img, reg_img, square_size=sq_size)
                st.image(checker, caption=f"Checkerboard Comparison (Tile Size: {sq_size}px)", use_container_width=True)
                
            elif mode == "Absolute Pixel Difference Heatmap":
                diff = cv2.absdiff(ref_img, reg_img)
                # Mask out unwarped boundary black areas
                valid_mask = reg_img > 0
                diff_masked = diff * valid_mask
                
                fig, ax = plt.subplots(figsize=(10, 6), dpi=150)
                im = ax.imshow(diff_masked, cmap="inferno")
                plt.colorbar(im, ax=ax, label="Absolute Pixel Intensity Error")
                ax.set_title("Intensity Difference Map (|Reference - Warped Source|)")
                ax.axis("off")
                st.pyplot(fig)
                plt.close(fig)
        else:
            st.warning("Could not read reference or registered image from disk. Please re-run the pipeline.")
    else:
        st.info("Registered output images not found. Run the pipeline above to enable interactive alignment studio.")


# -----------------------------------------------------------------------------
# TAB 5: TRANSFORMATION MATRIX & MATH
# -----------------------------------------------------------------------------
with tab_matrix:
    st.subheader("📐 Geometric Transformation Matrix")
    
    matrix_path = os.path.join(out_dir, "transformation_matrix.json")
    if os.path.exists(matrix_path):
        with open(matrix_path, "r") as f:
            mat_data = json.load(f)
            
        st.markdown(f"**Model Type:** `{mat_data.get('transform_type', 'homography').upper()}`")
        mat_arr = np.array(mat_data.get("matrix", []))
        
        if mat_arr.shape == (3, 3):
            st.latex(r"""
            \mathbf{H} = \begin{bmatrix}
            %.5f & %.5f & %.3f \\
            %.5f & %.5f & %.3f \\
            %.7f & %.7f & %.3f
            \end{bmatrix}
            """ % (
                mat_arr[0, 0], mat_arr[0, 1], mat_arr[0, 2],
                mat_arr[1, 0], mat_arr[1, 1], mat_arr[1, 2],
                mat_arr[2, 0], mat_arr[2, 1], mat_arr[2, 2]
            ))
            
            st.markdown("#### 🔍 Matrix Decomposition Properties")
            det = np.linalg.det(mat_arr)
            scale_x = np.sqrt(mat_arr[0, 0]**2 + mat_arr[1, 0]**2)
            scale_y = np.sqrt(mat_arr[0, 1]**2 + mat_arr[1, 1]**2)
            rotation_deg = np.rad2deg(np.arctan2(mat_arr[1, 0], mat_arr[0, 0]))
            
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Determinant", f"{det:.4f}")
            c2.metric("Estimated Scale X", f"{scale_x:.4f}")
            c3.metric("Estimated Scale Y", f"{scale_y:.4f}")
            c4.metric("Estimated Rotation", f"{rotation_deg:.2f}°")
            
        elif mat_arr.shape == (2, 3):
            st.latex(r"""
            \mathbf{A} = \begin{bmatrix}
            %.5f & %.5f & %.3f \\
            %.5f & %.5f & %.3f
            \end{bmatrix}
            """ % (
                mat_arr[0, 0], mat_arr[0, 1], mat_arr[0, 2],
                mat_arr[1, 0], mat_arr[1, 1], mat_arr[1, 2]
            ))
            
        st.json(mat_data)
    else:
        st.info("Transformation matrix not generated yet.")


# -----------------------------------------------------------------------------
# TAB 6: DOWNLOADS & ARTIFACTS
# -----------------------------------------------------------------------------
with tab_downloads:
    st.subheader("💾 Export Outputs & Generated Artifacts")
    
    if os.path.exists(out_dir):
        files = os.listdir(out_dir)
        if files:
            st.write(f"Artifacts available in `{out_dir}`:")
            for fn in files:
                fpath = os.path.join(out_dir, fn)
                with open(fpath, "rb") as f:
                    data_bytes = f.read()
                st.download_button(
                    label=f"⬇️ Download {fn} ({len(data_bytes)/1024:.1f} KB)",
                    data=data_bytes,
                    file_name=fn,
                    mime="application/octet-stream",
                    key=f"dl_{fn}"
                )
        else:
            st.info("No files in output directory.")
    else:
        st.info("Output directory has not been created yet.")
