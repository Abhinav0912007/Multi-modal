"""ROIService: Region of Interest geometry validation, coordinate mapping, and sub-scene extraction."""

from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from backend.services.raster_service import raster_service
from backend.services.pair_discovery import get_pair_paths
from backend.utils.imaging import array_to_png_bytes


class ROIService:
    """Manages Region of Interest (ROI) calculations and crops."""

    def get_roi_crop(
        self,
        pair_id: str,
        target: str,
        roi: Tuple[int, int, int, int]
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Extracts ROI cropped array and metadata for a specific dataset pair."""
        paths = get_pair_paths(pair_id)
        file_path = paths["source"] if target == "source" else paths["reference"]
        return raster_service.read_raster(file_path, subwindow=roi)

    def get_roi_preview_png(
        self,
        pair_id: str,
        target: str,
        roi: Tuple[int, int, int, int],
        max_dim: int = 1024
    ) -> bytes:
        """Returns PNG bytes of the selected ROI."""
        arr, _ = self.get_roi_crop(pair_id, target, roi)
        return array_to_png_bytes(arr, max_dim=max_dim)


roi_service = ROIService()
