"""FeatureService: Multi-modal lunar feature extraction and correspondence matching."""

from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np

from backend.processing.feature_matching import (
    detect_sift_features,
    match_descriptors,
    extract_matched_coordinates
)
from backend.processing.spatial_filter import filter_matches_by_spatial_grid
from backend.processing.subpixel import refine_matches_lucas_kanade
from backend.processing.visualization import draw_matches_side_by_side
from backend.utils.imaging import normalize_to_uint8, array_to_png_bytes


class FeatureService:
    """Performs feature detection, descriptor computation, and ratio-tested correspondence matching."""

    def extract_features(
        self,
        img_arr: np.ndarray,
        method: str = "sift",
        nfeatures: int = 5000
    ) -> Tuple[List[Any], np.ndarray]:
        """Extracts keypoints and descriptors from a single image."""
        u8 = normalize_to_uint8(img_arr)
        return detect_sift_features(u8, nfeatures=nfeatures)

    def match_features(
        self,
        img_src: np.ndarray,
        img_ref: np.ndarray,
        method: str = "sift",
        nfeatures: int = 15000,
        ratio_thresh: float = 0.75,
        grid_size: Tuple[int, int] = (8, 8),
        do_subpixel: bool = True
    ) -> Dict[str, Any]:
        """Runs full feature extraction, matching, spatial bucketing, and subpixel refinement."""
        u8_src = normalize_to_uint8(img_src)
        u8_ref = normalize_to_uint8(img_ref)

        kp_src, desc_src = detect_sift_features(u8_src, nfeatures=nfeatures)
        kp_ref, desc_ref = detect_sift_features(u8_ref, nfeatures=nfeatures)

        raw_matches = match_descriptors(desc_src, desc_ref, matcher_type="FLANN", ratio_thresh=ratio_thresh)

        # Spatial bucketing filter
        filtered_matches = filter_matches_by_spatial_grid(
            kp_src, kp_ref, raw_matches,
            img_shape=u8_src.shape,
            grid_size=grid_size
        )

        pts_src, pts_ref = extract_matched_coordinates(kp_src, kp_ref, filtered_matches)

        # Subpixel refinement
        if do_subpixel and len(pts_src) >= 4:
            try:
                pts_src, pts_ref = refine_matches_lucas_kanade(u8_src, u8_ref, pts_src, pts_ref)
            except Exception:
                pass

        return {
            "keypoints_src": kp_src,
            "keypoints_ref": kp_ref,
            "raw_matches": raw_matches,
            "filtered_matches": filtered_matches,
            "pts_src": pts_src,
            "pts_ref": pts_ref,
        }

    def render_matches_preview(
        self,
        img_src: np.ndarray,
        img_ref: np.ndarray,
        kp_src: List[Any],
        kp_ref: List[Any],
        matches: List[Any],
        max_matches: int = 150
    ) -> bytes:
        """Renders side-by-side correspondence lines image into PNG bytes."""
        u8_src = normalize_to_uint8(img_src)
        u8_ref = normalize_to_uint8(img_ref)

        draw_matches = sorted(matches, key=lambda m: getattr(m, 'distance', 0))[:max_matches]
        out_img = draw_matches_side_by_side(u8_src, kp_src, u8_ref, kp_ref, draw_matches)
        return array_to_png_bytes(out_img, max_dim=1200)


feature_service = FeatureService()
