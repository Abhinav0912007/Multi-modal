"""RasterService: PDS and GeoTIFF raster I/O, band extraction, downsampled thumbnail generation."""

import os
from typing import Any, Dict, Optional, Tuple
import numpy as np

from backend.processing.pds_reader import PDSReader
from backend.utils.imaging import array_to_png_bytes, normalize_to_uint8
from backend.utils.logger import get_logger

logger = get_logger("services.raster")


class RasterService:
    """Handles raster file reading, downsampling, and preview caching."""

    def __init__(self):
        self._cache: Dict[str, Tuple[np.ndarray, Dict[str, Any]]] = {}

    def read_raster(
        self,
        file_path: str,
        subwindow: Optional[Tuple[int, int, int, int]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Reads raster array and metadata. If subwindow is provided: (ymin, ymax, xmin, xmax)."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Raster file not found: {file_path}")

        # Check cache if reading entire image
        if subwindow is None and file_path in self._cache:
            return self._cache[file_path]

        arr, meta = PDSReader.read(file_path)

        if subwindow is not None:
            ymin, ymax, xmin, xmax = subwindow
            h, w = arr.shape[:2]
            ymin = max(0, min(h, ymin))
            ymax = max(ymin + 1, min(h, ymax))
            xmin = max(0, min(w, xmin))
            xmax = max(xmin + 1, min(w, xmax))
            arr = arr[ymin:ymax, xmin:xmax]

        elif len(self._cache) < 6:  # Cache up to 6 base scenes in memory
            self._cache[file_path] = (arr, meta)

        return arr, meta

    def get_preview_png(
        self,
        file_path: str,
        max_dim: int = 1024,
        subwindow: Optional[Tuple[int, int, int, int]] = None
    ) -> bytes:
        """Returns PNG bytes suitable for HTTP streaming preview."""
        arr, _ = self.read_raster(file_path, subwindow=subwindow)
        return array_to_png_bytes(arr, max_dim=max_dim)


raster_service = RasterService()
