"""
Module: backend/processing/preprocessing.py
Description: Lunar-tailored contrast enhancement, dynamic range compression, and CLAHE.
"""

import os
import numpy as np
import cv2


def normalize_to_8bit(img_array, p_low=1.0, p_high=99.0):
    """
    Robustly scales scientific 16-bit / 32-bit lunar satellite data to 8-bit [0, 255]
    using percentile clipping to prevent saturation from sensor glare or black borders.
    """
    if img_array is None or getattr(img_array, 'size', 0) == 0:
        return np.full((400, 400), 128, dtype=np.uint8)

    arr = np.array(img_array, dtype=np.float32)
    if arr.ndim < 2 or arr.shape[0] == 0 or arr.shape[1] == 0:
        return np.full((400, 400), 128, dtype=np.uint8)

    # Valid non-zero mask
    valid_mask = (arr > 0) & (~np.isnan(arr)) & (~np.isinf(arr))
    if np.count_nonzero(valid_mask) == 0:
        return np.zeros(arr.shape, dtype=np.uint8)

    v_min, v_max = np.percentile(arr[valid_mask], (p_low, p_high))
    if v_max <= v_min:
        v_max = v_min + 1.0

    clipped = np.clip(arr, v_min, v_max)
    scaled = ((clipped - v_min) / (v_max - v_min) * 255.0).astype(np.uint8)
    return scaled


def apply_lunar_clahe(img_8u, clip_limit=2.5, tile_grid_size=(8, 8)):
    """
    Applies CLAHE (Contrast Limited Adaptive Histogram Equalization)
    to enhance crater rims, ridges, and shadowed terrain features.
    """
    if len(img_8u.shape) == 3:
        gray = cv2.cvtColor(img_8u, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_8u

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    enhanced = clahe.apply(gray)
    return enhanced


def preprocess_image(raw_array, p_low=1.0, p_high=99.0, clip_limit=2.5, tile_grid=(8, 8), denoise=False):
    """
    Full preprocessing pipeline preserving the original scientific array
    and returning an 8-bit enhanced grayscale image optimized for feature extraction.
    """
    # 1. Intensity Normalization
    norm_8u = normalize_to_8bit(raw_array, p_low=p_low, p_high=p_high)

    # 2. Denoising (optional mild Gaussian blur)
    if denoise:
        norm_8u = cv2.GaussianBlur(norm_8u, (3, 3), 0.5)

    # 3. CLAHE Contrast Enhancement
    enhanced_8u = apply_lunar_clahe(norm_8u, clip_limit=clip_limit, tile_grid_size=tile_grid)

    return enhanced_8u


class ImagePreprocessor:
    """Preprocesses raw lunar raster arrays using normalization, optional denoising, and CLAHE."""

    def __init__(self, clip_limit: float = 2.5, tile_grid_size: tuple = (8, 8), denoise: bool = False):
        self.clip_limit = clip_limit
        self.tile_grid_size = tile_grid_size
        self.denoise = denoise

    def process(self, arr: np.ndarray) -> np.ndarray:
        return preprocess_image(
            arr,
            clip_limit=self.clip_limit,
            tile_grid=self.tile_grid_size,
            denoise=self.denoise
        )

