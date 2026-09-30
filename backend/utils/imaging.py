"""Imaging utilities: raster encoding, dynamic stretch, PNG serialization."""

import io
import cv2
import numpy as np
from PIL import Image


def normalize_to_uint8(arr: np.ndarray, p_low: float = 1.0, p_high: float = 99.0) -> np.ndarray:
    """Robust percentile-based contrast stretch to 8-bit uint8."""
    if arr is None or arr.size == 0:
        return np.zeros((100, 100), dtype=np.uint8)

    arr_clean = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
    vmin = float(np.percentile(arr_clean, p_low))
    vmax = float(np.percentile(arr_clean, p_high))

    if vmax <= vmin:
        vmin = float(arr_clean.min())
        vmax = float(arr_clean.max())

    if vmax > vmin:
        scaled = np.clip((arr_clean - vmin) / (vmax - vmin) * 255.0, 0, 255)
    else:
        scaled = np.zeros_like(arr_clean)

    return scaled.astype(np.uint8)


def array_to_png_bytes(arr: np.ndarray, max_dim: int = 1024) -> bytes:
    """Converts a numpy array to downscaled PNG bytes for fast network delivery."""
    u8 = normalize_to_uint8(arr) if arr.dtype != np.uint8 else arr

    h, w = u8.shape[:2]
    if max_dim and (w > max_dim or h > max_dim):
        scale = max_dim / max(w, h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        u8 = cv2.resize(u8, (nw, nh), interpolation=cv2.INTER_AREA)

    img = Image.fromarray(u8)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
