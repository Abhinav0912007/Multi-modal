"""
Chandrayaan-1 TMC Image Registration Pipeline
Architecture:
  Source (CH1 TMC Calibrated .img)
            │
            ▼
     SIFT + FLANN Matching
            │
            ▼
          RANSAC
            │
            ▼
        Homography
            │
            ▼
     REGISTERED IMAGE
            ▲
            │
  Reference (CH1 TMC Derived Ortho .tif)

Features:
- Handles massive gigapixel datasets (18.8 GB+ GeoTIFFs and multi-gigabyte PDS .img files) using zero-copy memory mapping (`np.memmap` / `tifffile.memmap`).
- Percentile-based dynamic range scaling + CLAHE for shadowed lunar topography.
- Multi-scale / ROI feature matching and RANSAC outlier rejection.
- Homography matrix estimation with RMSE error metrics.
- Visualizers: Matched Keypoints, Alpha Overlay, and Checkerboard Comparison.
"""

import os
import sys
import xml.etree.ElementTree as ET
import numpy as np
import cv2
import tifffile


def parse_pds_xml_metadata(xml_path):
    """
    Parses PDS4 XML metadata to extract array dimensions and data type.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()
    lines = None
    samples = None
    data_type = '<u2'  # Default UnsignedLSB2

    for elem in root.iter():
        tag = elem.tag.split('}')[-1]
        if tag == 'axis_name' and elem.text == 'Line':
            pass
        if tag == 'elements' and lines is None:
            lines = int(elem.text)
        elif tag == 'elements' and samples is None:
            samples = int(elem.text)
        elif tag == 'data_type':
            if 'UnsignedLSB2' in elem.text or 'UnsignedByte' not in elem.text:
                data_type = '<u2'
            elif 'UnsignedByte' in elem.text:
                data_type = np.uint8

    return lines, samples, data_type


def load_source_memmap(img_path, xml_path=None, shape=None, dtype='<u2'):
    """
    Memory-maps a raw PDS .img calibrated source raster without loading into RAM.
    """
    if xml_path and os.path.exists(xml_path) and shape is None:
        lines, samples, dt = parse_pds_xml_metadata(xml_path)
        shape = (lines, samples)
        dtype = dt
    elif shape is None:
        raise ValueError("Must provide either a valid xml_path or an explicit shape (lines, samples).")

    print(f"[I/O] Memory-mapping Source IMG '{os.path.basename(img_path)}' with shape={shape}, dtype={dtype}")
    mmap = np.memmap(img_path, dtype=dtype, mode='r', shape=shape)
    return mmap


def load_reference_memmap(tif_path):
    """
    Memory-maps a large Reference Ortho GeoTIFF (e.g. 18.8 GB) without loading into RAM.
    """
    print(f"[I/O] Memory-mapping Reference TIFF '{os.path.basename(tif_path)}'")
    mmap = tifffile.memmap(tif_path, mode='r')
    print(f"[I/O] Reference shape: {mmap.shape}, dtype: {mmap.dtype}")
    return mmap


def preprocess_lunar_patch(raw_patch, p_low=1.0, p_high=99.0, clahe_clip=2.5, tile_grid=(8, 8)):
    """
    Applies lunar-specific contrast enhancement:
    1. Robust percentile clipping to eliminate sensor dead pixels / extreme glare.
    2. Conversion to 8-bit.
    3. CLAHE for enhanced crater rim and terrain texture visibility.
    """
    patch = np.array(raw_patch, dtype=np.float32)
    
    # Mask out zeroes (background / nodata)
    valid_mask = patch > 0
    if np.count_nonzero(valid_mask) == 0:
        return np.zeros(patch.shape, dtype=np.uint8)

    v_min, v_max = np.percentile(patch[valid_mask], (p_low, p_high))
    if v_max <= v_min:
        v_max = v_min + 1.0

    clipped = np.clip(patch, v_min, v_max)
    scaled = ((clipped - v_min) / (v_max - v_min) * 255.0).astype(np.uint8)

    clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=tile_grid)
    enhanced = clahe.apply(scaled)
    return enhanced


def extract_and_match_sift(src_8u, ref_8u, max_features=15000, ratio_thresh=0.75):
    """
    Extracts SIFT keypoints & descriptors and matches them using FLANN with Lowe's ratio test.
    """
    sift = cv2.SIFT_create(
        nfeatures=max_features,
        contrastThreshold=0.025,
        edgeThreshold=12,
        sigma=1.6
    )

    kp_src, des_src = sift.detectAndCompute(src_8u, None)
    kp_ref, des_ref = sift.detectAndCompute(ref_8u, None)

    if des_src is None or des_ref is None or len(kp_src) < 4 or len(kp_ref) < 4:
        print(f"[Warn] Insufficient keypoints extracted (src: {len(kp_src)}, ref: {len(kp_ref)})")
        return kp_src, kp_ref, []

    # FLANN Matcher
    index_params = dict(algorithm=1, trees=5)  # KD-Tree
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)

    knn_matches = flann.knnMatch(des_src, des_ref, k=2)

    # Lowe's ratio test
    good_matches = []
    for pair in knn_matches:
        if len(pair) == 2:
            m, n = pair
            if m.distance < ratio_thresh * n.distance:
                good_matches.append(m)

    print(f"[SIFT] Extracted {len(kp_src)} src keypoints, {len(kp_ref)} ref keypoints.")
    print(f"[Matching] {len(good_matches)} good matches passed Lowe's ratio test ({ratio_thresh}).")
    return kp_src, kp_ref, good_matches


def estimate_homography_ransac(kp_src, kp_ref, matches, reproj_thresh=3.0, max_iters=3000):
    """
    Estimates the 3x3 Homography Matrix H using RANSAC outlier filtering.
    """
    if len(matches) < 4:
        raise ValueError(f"Need >= 4 matches for Homography, got {len(matches)}.")

    src_pts = np.float32([kp_src[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    ref_pts = np.float32([kp_ref[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(
        src_pts,
        ref_pts,
        method=cv2.RANSAC,
        ransacReprojThreshold=reproj_thresh,
        maxIters=max_iters,
        confidence=0.999
    )

    if H is None:
        raise RuntimeError("RANSAC failed to find a valid Homography matrix.")

    inliers = mask.ravel().tolist()
    inlier_count = sum(inliers)
    inlier_ratio = (inlier_count / len(matches)) * 100

    # Calculate RMSE on inlier points
    inlier_src = src_pts[mask == 1]
    inlier_ref = ref_pts[mask == 1]
    proj_src = cv2.perspectiveTransform(inlier_src.reshape(-1, 1, 2), H).reshape(-1, 2)
    rmse = np.sqrt(np.mean(np.sum((proj_src - inlier_ref.reshape(-1, 2)) ** 2, axis=1)))

    print(f"[RANSAC] Inliers: {inlier_count}/{len(matches)} ({inlier_ratio:.2f}%)")
    print(f"[Evaluation] Alignment RMSE: {rmse:.4f} pixels")

    return H, mask, rmse


def create_checkerboard(img1, img2, square_size=64):
    """
    Generates a checkerboard composite of two registered images to visually inspect alignment.
    """
    h, w = img1.shape[:2]
    out = np.zeros_like(img1)
    for y in range(0, h, square_size):
        for x in range(0, w, square_size):
            y_end = min(y + square_size, h)
            x_end = min(x + square_size, w)
            if ((x // square_size) + (y // square_size)) % 2 == 0:
                out[y:y_end, x:x_end] = img1[y:y_end, x:x_end]
            else:
                out[y:y_end, x:x_end] = img2[y:y_end, x:x_end]
    return out


def run_registration_pipeline(src_img_path, src_xml_path, ref_tif_path, output_dir="results", roi_lines=(0, 6000), roi_samples=(0, 4000)):
    """
    Runs the complete registration workflow on a defined Region of Interest (ROI) or full strip.
    """
    os.makedirs(output_dir, exist_ok=True)

    # 1. Memory-map inputs
    src_mmap = load_source_memmap(src_img_path, xml_path=src_xml_path)
    ref_mmap = load_reference_memmap(ref_tif_path)

    # 2. Extract ROI patch from Source (Calibrated TMC)
    l_start, l_end = roi_lines
    s_start, s_end = roi_samples
    print(f"[Pipeline] Extracting Source ROI: Lines [{l_start}:{l_end}], Samples [{s_start}:{s_end}]")
    src_patch_raw = np.array(src_mmap[l_start:l_end, s_start:s_end])

    # For demonstration/matching against reference, sample a corresponding reference region
    # Or downsample reference if global registration is needed
    ref_h, ref_w = ref_mmap.shape[:2]
    # Sample a representative chunk from reference or use overlapping window
    ref_patch_raw = np.array(ref_mmap[:min(ref_h, 8000), :min(ref_w, 6000)])

    # 3. Contrast Preprocessing
    print("[Pipeline] Enhancing contrast with CLAHE...")
    src_proc = preprocess_lunar_patch(src_patch_raw)
    ref_proc = preprocess_lunar_patch(ref_patch_raw)

    # 4. SIFT Extraction & Matching
    print("[Pipeline] Extracting SIFT features and computing matches...")
    kp_src, kp_ref, matches = extract_and_match_sift(src_proc, ref_proc)

    if len(matches) < 4:
        print("[Pipeline] Insufficient matches for automatic homography on arbitrary ROI slice.")
        print("[Pipeline] Saving preprocessed source and reference test samples...")
        cv2.imwrite(os.path.join(output_dir, "source_preprocessed.png"), src_proc)
        cv2.imwrite(os.path.join(output_dir, "reference_preprocessed.png"), ref_proc)
        return

    # 5. RANSAC & Homography
    print("[Pipeline] Estimating Homography with RANSAC...")
    H, mask, rmse = estimate_homography_ransac(kp_src, kp_ref, matches)

    # 6. Warp Source onto Reference Frame
    h_ref, w_ref = ref_proc.shape[:2]
    registered_src = cv2.warpPerspective(
        src_proc,
        H,
        (w_ref, h_ref),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0
    )

    # 7. Generate Verification Visualizations
    print("[Pipeline] Generating visual verification artifacts...")
    # Matches visualization
    matches_img = cv2.drawMatches(
        src_proc, kp_src,
        ref_proc, kp_ref,
        [m for i, m in enumerate(matches) if mask.ravel()[i] == 1][:100],
        None,
        flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS
    )
    cv2.imwrite(os.path.join(output_dir, "inlier_matches.png"), matches_img)

    # Alpha blend overlay
    overlay = cv2.addWeighted(ref_proc, 0.5, registered_src, 0.5, 0)
    cv2.imwrite(os.path.join(output_dir, "registered_overlay.png"), overlay)

    # Checkerboard
    checker = create_checkerboard(ref_proc, registered_src, square_size=128)
    cv2.imwrite(os.path.join(output_dir, "checkerboard_comparison.png"), checker)

    # Save registered image
    cv2.imwrite(os.path.join(output_dir, "registered_source.png"), registered_src)

    # Save Homography Matrix
    np.savetxt(os.path.join(output_dir, "homography_matrix.txt"), H, fmt="%.8f")

    print(f"\n[Success] Registration Complete!")
    print(f" - Output Directory: {output_dir}")
    print(f" - Alignment RMSE:   {rmse:.4f} px")
    print(f" - Saved Homography: {os.path.join(output_dir, 'homography_matrix.txt')}")


if __name__ == "__main__":
    SRC_IMG = r"data/pairs/pair_001/source/extracted/data/calibrated/20090529/ch1_tmc_nca_20090529T0853239926_d_img_d18.img"
    SRC_XML = r"data/pairs/pair_001/source/extracted/data/calibrated/20090529/ch1_tmc_nca_20090529T0853239926_d_img_d18.xml"
    REF_TIF = r"data/pairs/pair_001/refrence/ch1_tmc_ndn_20090530T1441405667_d_oth_d18.tif"

    run_registration_pipeline(SRC_IMG, SRC_XML, REF_TIF, output_dir="registration_results")
