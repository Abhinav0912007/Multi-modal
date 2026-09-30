"""Geospatial and coordinate utility helpers for Chandrayaan-1 / Lunar datasets."""

from typing import Any, Dict, List, Tuple
import numpy as np


def compute_matrix_properties(matrix_3x3: np.ndarray) -> Dict[str, float]:
    """Decomposes a 3x3 homography or affine matrix into rotation, scale, and translation."""
    if matrix_3x3 is None or matrix_3x3.shape != (3, 3):
        return {
            "scale_x": 1.0,
            "scale_y": 1.0,
            "rotation_deg": 0.0,
            "translation_x": 0.0,
            "translation_y": 0.0,
            "condition_number": 1.0,
            "determinant": 1.0,
        }

    h = matrix_3x3.copy()
    if abs(h[2, 2]) > 1e-8:
        h /= h[2, 2]

    # Extract 2x2 affine portion
    a, b = h[0, 0], h[0, 1]
    c, d = h[1, 0], h[1, 1]

    sx = float(np.sqrt(a * a + c * c))
    sy = float(np.sqrt(b * b + d * d))
    rot_rad = float(np.arctan2(c, a))
    rot_deg = float(np.degrees(rot_rad))
    tx = float(h[0, 2])
    ty = float(h[1, 2])

    try:
        cond = float(np.linalg.cond(h))
    except Exception:
        cond = 1.0

    det = float(np.linalg.det(h))

    return {
        "scale_x": round(sx, 6),
        "scale_y": round(sy, 6),
        "rotation_deg": round(rot_deg, 4),
        "translation_x": round(tx, 3),
        "translation_y": round(ty, 3),
        "condition_number": round(cond, 4),
        "determinant": round(det, 6),
    }
