"""Pydantic schemas for feature extraction, matching, and spatial analysis."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FeatureExtractRequest(BaseModel):
    pair_id: str
    target: str = Field(default="source", description="'source' or 'reference'")
    method: str = Field(default="sift", description="'sift', 'orb', 'superpoint'")
    nfeatures: int = Field(default=5000, description="Max keypoints to detect")
    roi: Optional[List[int]] = None


class KeypointData(BaseModel):
    x: float
    y: float
    size: float
    response: float


class FeatureExtractResponse(BaseModel):
    pair_id: str
    target: str
    method: str
    keypoints_count: int
    sample_keypoints: List[KeypointData]
    preview_url: str


class FeatureMatchRequest(BaseModel):
    pair_id: str
    roi_src: Optional[List[int]] = None
    roi_ref: Optional[List[int]] = None
    method: str = Field(default="sift")
    ratio_thresh: float = Field(default=0.75)
    do_subpixel: bool = Field(default=True)


class MatchPair(BaseModel):
    src_pt: List[float]
    ref_pt: List[float]
    distance: float
    inlier: bool


class FeatureMatchResponse(BaseModel):
    pair_id: str
    total_raw_matches: int
    ratio_passed_matches: int
    inlier_matches: int
    inlier_ratio: float
    matches_preview_url: str


class SpatialAnalysisRequest(BaseModel):
    pair_id: str
    grid_size: int = Field(default=8, description="Grid dimension (N x N)")
    roi_src: Optional[List[int]] = None
    roi_ref: Optional[List[int]] = None


class SpatialCellInfo(BaseModel):
    row: int
    col: int
    matches_count: int
    coverage_score: float


class SpatialAnalysisResponse(BaseModel):
    pair_id: str
    grid_size: int
    total_cells: int
    active_cells: int
    spatial_coverage_pct: float
    distribution_score: float
    cells: List[SpatialCellInfo]
    heatmap_url: str
