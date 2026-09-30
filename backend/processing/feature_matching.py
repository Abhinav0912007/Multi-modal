"""
Module: backend/processing/feature_matching.py
Description: SIFT feature extraction and FLANN/BFMatcher with Lowe's ratio test.
"""

import cv2
import numpy as np


def detect_sift_features(img_8u, nfeatures=15000, contrast_thresh=0.025, edge_thresh=12, sigma=1.6):
    """
    Detects SIFT keypoints and computes 128-d floating-point descriptors.
    """
    sift = cv2.SIFT_create(
        nfeatures=nfeatures,
        contrastThreshold=contrast_thresh,
        edgeThreshold=edge_thresh,
        sigma=sigma
    )
    keypoints, descriptors = sift.detectAndCompute(img_8u, None)
    print(f"[SIFT] Detected {len(keypoints)} keypoints.")
    return keypoints, descriptors


def match_descriptors(des_src, des_ref, matcher_type="FLANN", ratio_thresh=0.75):
    """
    Matches SIFT descriptors using FLANN (KD-Tree) or BFMatcher and filters using Lowe's ratio test.
    """
    if des_src is None or des_ref is None or len(des_src) == 0 or len(des_ref) == 0:
        return []

    if matcher_type.upper() == "FLANN":
        index_params = dict(algorithm=1, trees=5)  # FLANN_INDEX_KDTREE
        search_params = dict(checks=50)
        matcher = cv2.FlannBasedMatcher(index_params, search_params)
    else:
        matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

    knn_matches = matcher.knnMatch(des_src, des_ref, k=2)

    good_matches = []
    for pair in knn_matches:
        if len(pair) == 2:
            m, n = pair
            if m.distance < ratio_thresh * n.distance:
                good_matches.append(m)

    print(f"[Matching] {len(good_matches)} good matches passed Lowe's ratio test ({ratio_thresh}).")
    return good_matches


def extract_matched_coordinates(kp_src, kp_ref, good_matches):
    """
    Extracts Nx2 coordinate arrays from good matches.
    """
    if not good_matches:
        return np.empty((0, 2), dtype=np.float32), np.empty((0, 2), dtype=np.float32)

    src_pts = np.float32([kp_src[m.queryIdx].pt for m in good_matches])
    ref_pts = np.float32([kp_ref[m.trainIdx].pt for m in good_matches])
    return src_pts, ref_pts
