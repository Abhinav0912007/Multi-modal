"""Pydantic schemas for alignment studio, transformation analysis, and export."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.models.job import TransformationType


class AlignmentRequest(BaseModel):
    pair_id: str
    mode: str = Field(default="checkerboard", description="'checkerboard', 'blend', 'difference', 'side_by_side'")
    blend_alpha: float = Field(default=0.5, ge=0.0, le=1.0)
    checkerboard_tiles: int = Field(default=8, ge=2, le=32)


class AlignmentResponse(BaseModel):
    pair_id: str
    mode: str
    rmse: float
    ssim: float
    mutual_information: float
    preview_url: str


class TransformationRequest(BaseModel):
    pair_id: str
    transform_type: TransformationType = TransformationType.HOMOGRAPHY
    ransac_thresh: float = Field(default=3.0, ge=0.5, le=10.0)


class TransformationResponse(BaseModel):
    pair_id: str
    transform_type: str
    matrix: List[List[float]]
    scale_x: float
    scale_y: float
    rotation_deg: float
    translation_x: float
    translation_y: float
    rmse: float
    condition_number: float
    determinant: float


class ExportRequest(BaseModel):
    pair_id: str
    job_id: Optional[str] = None
    formats: List[str] = Field(default=["geotiff", "matrix_json", "report_pdf"])
    include_stac_metadata: bool = True


class ExportResponse(BaseModel):
    pair_id: str
    export_id: str
    download_url: str
    files: List[str]
    total_size_bytes: int
    created_at: str
