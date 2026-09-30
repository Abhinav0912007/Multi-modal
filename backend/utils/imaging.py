"""Imaging utilities: raster encoding, dynamic stretch, PNG serialization."""

import io
import cv2
import numpy as np
from PIL import Image


def normalize_to_uint8(arr: np.ndarray, p_low: float = 1.0, p_high: float = 99.0) -> np.ndarray:
    """Robust percentile-based contrast stretch to 8-bit uint8 with low memory footprint."""
    if arr is None or arr.size == 0:
        return np.zeros((100, 100), dtype=np.uint8)

    # For large arrays, estimate percentiles using a fast stride/subsample
    if arr.size > 250000:
        sample_step = max(1, int(np.sqrt(arr.size / 50000)))
        sample = arr[::sample_step, ::sample_step] if arr.ndim == 2 else arr[::sample_step]
        sample_clean = np.nan_to_num(sample, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
        vmin = float(np.percentile(sample_clean, p_low))
        vmax = float(np.percentile(sample_clean, p_high))
    else:
        arr_clean = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
        vmin = float(np.percentile(arr_clean, p_low))
        vmax = float(np.percentile(arr_clean, p_high))

    if vmax <= vmin:
        vmin = float(np.nanmin(arr)) if np.issubdtype(arr.dtype, np.floating) else float(arr.min())
        vmax = float(np.nanmax(arr)) if np.issubdtype(arr.dtype, np.floating) else float(arr.max())

    if vmax > vmin:
        arr_f32 = np.nan_to_num(arr, nan=vmin, posinf=vmax, neginf=vmin).astype(np.float32)
        scaled = np.clip((arr_f32 - vmin) / (vmax - vmin) * 255.0, 0, 255)
    else:
        scaled = np.zeros_like(arr, dtype=np.float32)

    return scaled.astype(np.uint8)


def array_to_png_bytes(arr: np.ndarray, max_dim: int = 1024) -> bytes:
    """Converts a numpy array to downscaled PNG bytes for fast network delivery. Subsamples first to avoid high RAM use."""
    h, w = arr.shape[:2]

    # Pre-subsample if array is larger than max_dim to never allocate large arrays
    if max_dim and (w > max_dim or h > max_dim):
        step = max(1, int(max(h, w) / max_dim))
        sub = arr[::step, ::step]
    else:
        sub = arr

    u8 = normalize_to_uint8(sub) if sub.dtype != np.uint8 else sub

    uh, uw = u8.shape[:2]
    if max_dim and (uw > max_dim or uh > max_dim):
        scale = max_dim / max(uw, uh)
        nw, nh = max(1, int(uw * scale)), max(1, int(uh * scale))
        u8 = cv2.resize(u8, (nw, nh), interpolation=cv2.INTER_AREA)

    img = Image.fromarray(u8)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()

