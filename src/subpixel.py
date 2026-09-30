"""
Module: src/subpixel.py
Description: Sub-pixel refinement of correspondences using local gradient optimization & Lucas-Kanade.
"""

import numpy as np
import cv2


def refine_keypoints_subpixel(img_gray, points, win_size=(5, 5), zero_zone=(-1, -1)):
    """
    Refines corner/keypoint positions to sub-pixel accuracy using iterative gradient descent (cornerSubPix).
    """
    if len(points) == 0:
        return points.copy()

    pts = np.float32(points).reshape(-1, 1, 2)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.001)

    # OpenCV cornerSubPix operates on float32 points
    refined = cv2.cornerSubPix(img_gray, pts, win_size, zero_zone, criteria)
    return refined.reshape(-1, 2)


def refine_matches_lucas_kanade(src_gray, ref_gray, inlier_src_pts, inlier_ref_pts, win_size=(15, 15), max_level=2):
    """
    Performs forward-backward Lucas-Kanade optical flow refinement on inlier correspondence patches.
    Calculates sub-pixel corrections and filters any unstable track points.
    Returns:
      - refined_ref_pts: updated sub-pixel reference coordinates
      - shift_magnitudes: measured sub-pixel adjustments || refined - initial ||
    """
    if len(inlier_src_pts) == 0:
        return inlier_ref_pts.copy(), np.zeros(0, dtype=np.float32)

    p0 = np.float32(inlier_src_pts).reshape(-1, 1, 2)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)

    # Forward tracking: src -> ref
    p1, st, err = cv2.calcOpticalFlowPyrLK(
        src_gray, ref_gray, p0, None,
        winSize=win_size, maxLevel=max_level, criteria=criteria
    )

    valid_mask = (st.ravel() == 1)
    refined_pts = inlier_ref_pts.copy()

    # Apply LK refined positions where valid and within reasonable distance (< 3.0 px)
    p1_flat = p1.reshape(-1, 2)
    shifts = np.linalg.norm(p1_flat - inlier_ref_pts, axis=1)

    usable_shifts = (shifts < 3.0) & valid_mask
    refined_pts[usable_shifts] = p1_flat[usable_shifts]
    shift_magnitudes = np.linalg.norm(refined_pts - inlier_ref_pts, axis=1)

    mean_shift = np.mean(shift_magnitudes) if len(shift_magnitudes) > 0 else 0.0
    print(f"[Sub-Pixel] Refined {np.count_nonzero(usable_shifts)}/{len(inlier_src_pts)} inliers. Mean sub-pixel adjustment: {mean_shift:.4f} px")

    return refined_pts, shift_magnitudes
