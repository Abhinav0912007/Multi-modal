"""
Module: backend/processing/registration.py
Description: Robust geometric transformation estimation (Homography/Affine with RANSAC) and image warping.
"""

import numpy as np
import cv2


def estimate_transformation_ransac(src_pts, ref_pts, transform_type="homography", ransac_thresh=3.0, max_iters=3000, confidence=0.999):
    """
    Estimates Homography or Affine transformation matrix using RANSAC.
    Returns:
      - matrix: 3x3 Homography or 2x3 Affine
      - inliers_mask: boolean array (True for inlier, False for outlier)
      - reproj_errors: array of reprojection errors in pixels for all input points
    """
    if len(src_pts) < 4:
        raise ValueError(f"Need at least 4 points to estimate transformation, got {len(src_pts)}")

    src_arr = src_pts.reshape(-1, 1, 2)
    ref_arr = ref_pts.reshape(-1, 1, 2)

    if transform_type.lower() == "homography":
        matrix, mask = cv2.findHomography(
            src_arr,
            ref_arr,
            method=cv2.RANSAC,
            ransacReprojThreshold=ransac_thresh,
            maxIters=max_iters,
            confidence=confidence
        )
        if matrix is None:
            raise RuntimeError("RANSAC failed to estimate a valid Homography.")

        # Compute reprojection errors: || H * src - ref ||
        proj_src = cv2.perspectiveTransform(src_arr, matrix).reshape(-1, 2)
        errors = np.linalg.norm(proj_src - ref_pts, axis=1)

    elif transform_type.lower() == "affine":
        matrix, inliers = cv2.estimateAffine2D(
            src_pts,
            ref_pts,
            method=cv2.RANSAC,
            ransacReprojThreshold=ransac_thresh,
            maxIters=max_iters,
            confidence=confidence
        )
        if matrix is None:
            raise RuntimeError("RANSAC failed to estimate a valid Affine matrix.")
        mask = inliers

        # Compute affine reprojection errors: || A * src - ref ||
        src_hom = np.hstack([src_pts, np.ones((len(src_pts), 1), dtype=np.float32)])
        proj_src = (matrix @ src_hom.T).T
        errors = np.linalg.norm(proj_src - ref_pts, axis=1)

    else:
        raise ValueError(f"Unknown transform_type: {transform_type}")

    inliers_mask = (mask.ravel() == 1)
    return matrix, inliers_mask, errors


def warp_image_to_reference(src_img, matrix, ref_shape, transform_type="homography", interpolation=cv2.INTER_CUBIC):
    """
    Warps the source image into the reference coordinate system matching reference dimensions.
    """
    h_ref, w_ref = ref_shape[:2]

    if transform_type.lower() == "homography":
        warped = cv2.warpPerspective(
            src_img,
            matrix,
            (w_ref, h_ref),
            flags=interpolation,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0
        )
    elif transform_type.lower() == "affine":
        warped = cv2.warpAffine(
            src_img,
            matrix,
            (w_ref, h_ref),
            flags=interpolation,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0
        )
    else:
        raise ValueError(f"Unsupported transformation type: {transform_type}")

    return warped
