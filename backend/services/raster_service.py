"""RasterService: High-performance PDS and GeoTIFF raster I/O, band extraction, downsampled thumbnail generation, and tile streaming."""

import os
import hashlib
from typing import Any, Dict, Optional, Tuple
import cv2
import numpy as np

from backend.config import DATA_DIR
from backend.processing.pds_reader import PDSReader
from backend.utils.imaging import array_to_png_bytes, normalize_to_uint8
from backend.utils.logger import get_logger

logger = get_logger("services.raster")

CACHE_DIR = os.path.join(DATA_DIR, "cache")
THUMB_CACHE_DIR = os.path.join(CACHE_DIR, "thumbnails")
TILE_CACHE_DIR = os.path.join(CACHE_DIR, "tiles")

os.makedirs(THUMB_CACHE_DIR, exist_ok=True)
os.makedirs(TILE_CACHE_DIR, exist_ok=True)


class RasterService:
    """Handles raster file reading, downsampling, two-tier preview caching, and pyramid tiling."""

    def __init__(self):
        self._meta_cache: Dict[str, Dict[str, Any]] = {}
        self._thumb_mem_cache: Dict[str, bytes] = {}
        self._tile_mem_cache: Dict[str, bytes] = {}
        self._max_mem_cache = 128

    def _cache_key(self, file_path: str, extra: str = "") -> str:
        stat_key = f"{file_path}_{os.path.getmtime(file_path)}_{extra}" if os.path.exists(file_path) else f"{file_path}_{extra}"
        return hashlib.sha256(stat_key.encode("utf-8")).hexdigest()[:16]

    def read_raster(
        self,
        file_path: str,
        subwindow: Optional[Tuple[int, int, int, int]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Reads raster array and metadata. If subwindow is provided: (ymin, ymax, xmin, xmax)."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Raster file not found: {file_path}")

        arr, meta = PDSReader.read(file_path, roi=subwindow)

        if subwindow is not None and not (hasattr(arr, "shape") and arr.shape[0] == (subwindow[1] - subwindow[0])):
            ymin, ymax, xmin, xmax = subwindow
            h, w = arr.shape[:2]
            ymin = max(0, min(h, ymin))
            ymax = max(ymin + 1, min(h, ymax))
            xmin = max(0, min(w, xmin))
            xmax = max(xmin + 1, min(w, xmax))
            arr = arr[ymin:ymax, xmin:xmax]

        return arr, meta

    def get_preview_png(
        self,
        file_path: str,
        max_dim: int = 1024,
        subwindow: Optional[Tuple[int, int, int, int]] = None
    ) -> bytes:
        """
        Returns PNG bytes suitable for HTTP streaming preview with disk and memory caching.
        Prevents gigabyte-scale memory allocations by utilizing memory-mapping and step-downsampling.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Raster file not found: {file_path}")

        key = self._cache_key(file_path, f"prev_{max_dim}_{subwindow}")

        # 1. Check in-memory L1 cache
        if key in self._thumb_mem_cache:
            return self._thumb_mem_cache[key]

        # 2. Check disk L2 cache
        disk_path = os.path.join(THUMB_CACHE_DIR, f"{key}.png")
        if os.path.exists(disk_path):
            try:
                with open(disk_path, "rb") as f:
                    data = f.read()
                if len(data) > 0:
                    if len(self._thumb_mem_cache) < self._max_mem_cache:
                        self._thumb_mem_cache[key] = data
                    return data
            except Exception:
                pass

        # 3. Read raster (utilizing fast memmapping if large)
        arr, _ = self.read_raster(file_path, subwindow=subwindow)
        png_bytes = array_to_png_bytes(arr, max_dim=max_dim)

        # 4. Save to disk cache & memory cache
        try:
            with open(disk_path, "wb") as f:
                f.write(png_bytes)
        except Exception as e:
            logger.warning(f"Failed to write thumbnail disk cache: {e}")

        if len(self._thumb_mem_cache) < self._max_mem_cache:
            self._thumb_mem_cache[key] = png_bytes

        return png_bytes

    def get_tile_png(
        self,
        file_path: str,
        z: int,
        x: int,
        y: int,
        tile_size: int = 256,
        max_level: int = 8
    ) -> bytes:
        """
        Returns a 256x256 PNG tile at pyramid level z and coordinate (x, y).
        Enables streaming gigabyte/terabyte-scale lunar rasters without downloading full files.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Raster file not found: {file_path}")

        tile_key = self._cache_key(file_path, f"tile_{z}_{x}_{y}_{tile_size}")

        if tile_key in self._tile_mem_cache:
            return self._tile_mem_cache[tile_key]

        disk_tile_path = os.path.join(TILE_CACHE_DIR, f"{tile_key}.png")
        if os.path.exists(disk_tile_path):
            try:
                with open(disk_tile_path, "rb") as f:
                    data = f.read()
                if len(data) > 0:
                    if len(self._tile_mem_cache) < self._max_mem_cache:
                        self._tile_mem_cache[tile_key] = data
                    return data
            except Exception:
                pass

        # Calculate bounding box in world space
        scale = 2 ** max(0, max_level - z)
        world_w = tile_size * scale
        world_h = tile_size * scale

        xmin = x * world_w
        xmax = xmin + world_w
        ymin = y * world_h
        ymax = ymin + world_h

        arr, _ = self.read_raster(file_path, subwindow=(ymin, ymax, xmin, xmax))

        if arr.size == 0:
            blank = np.zeros((tile_size, tile_size), dtype=np.uint8)
            png_bytes = cv2.imencode(".png", blank)[1].tobytes()
        else:
            u8 = normalize_to_uint8(arr) if arr.dtype != np.uint8 else arr
            if u8.shape[0] != tile_size or u8.shape[1] != tile_size:
                u8 = cv2.resize(u8, (tile_size, tile_size), interpolation=cv2.INTER_AREA)
            png_bytes = cv2.imencode(".png", u8)[1].tobytes()

        # Cache
        try:
            with open(disk_tile_path, "wb") as f:
                f.write(png_bytes)
        except Exception:
            pass

        if len(self._tile_mem_cache) < self._max_mem_cache:
            self._tile_mem_cache[tile_key] = png_bytes

        return png_bytes


raster_service = RasterService()

