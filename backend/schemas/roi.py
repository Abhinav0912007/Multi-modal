"""Pydantic schemas for ROI, preview, and preprocessing operations."""

from typing import List, Optional
from pydantic import BaseModel, Field


class ROIRequest(BaseModel):
    pair_id: str
    target: str = Field(description="'source' or 'reference'")
    ymin: int
    ymax: int
    xmin: int
    xmax: int


class ROICropResponse(BaseModel):
    pair_id: str
    target: str
    bounds: List[int]
    width: int
    height: int
    preview_url: str


class PreviewQuery(BaseModel):
    pair_id: str
    target: str = Field(default="source", description="'source' or 'reference'")
    max_dimension: int = Field(default=1024, description="Max pixel width or height for thumbnail downsampling")


class PreprocessingRequest(BaseModel):
    pair_id: str
    target: str = Field(default="source", description="'source' or 'reference'")
    roi: Optional[List[int]] = None
    apply_clahe: bool = Field(default=True, description="Apply Contrast Limited Adaptive Histogram Equalization")
    clip_limit: float = Field(default=2.0, description="CLAHE clip limit")
    tile_grid_size: int = Field(default=8, description="CLAHE grid dimension")
    denoise: bool = Field(default=True, description="Bilateral filter noise suppression")
    normalize_percentile: float = Field(default=99.5, description="Percentile stretch normalization")


class PreprocessingResponse(BaseModel):
    pair_id: str
    target: str
    processed_preview_url: str
    mean_intensity: float
    std_intensity: float
    contrast_ratio: float
