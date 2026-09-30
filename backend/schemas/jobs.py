"""Pydantic schemas for job-based processing."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.models.job import JobStatus, TransformationType


class JobCreateRequest(BaseModel):
    pair_id: str
    roi_src: List[int] = Field(default=[0, 6000, 0, 4000], description="Source ROI bounds: [ymin, ymax, xmin, xmax]")
    roi_ref: List[int] = Field(default=[35000, 41000, 60000, 64000], description="Reference ROI bounds: [ymin, ymax, xmin, xmax]")
    transform_type: TransformationType = Field(default=TransformationType.HOMOGRAPHY, description="Transformation model")
    nfeatures: int = Field(default=15000, description="Max SIFT/ORB features to extract")
    ratio_thresh: float = Field(default=0.75, description="Lowe's ratio test threshold")
    grid_size: int = Field(default=8, description="Spatial bucket grid dimension (N x N)")
    ransac_thresh: float = Field(default=3.0, description="RANSAC outlier threshold in pixels")
    do_subpixel: bool = Field(default=True, description="Enable Lucas-Kanade sub-pixel refinement")


class JobCreateResponse(BaseModel):
    job_id: str
    status: JobStatus = JobStatus.QUEUED
    message: str = "Job successfully queued for asynchronous processing"


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int = Field(ge=0, le=100)
    current_step: int
    total_steps: int = 10
    step_message: str
    error: Optional[str] = None
    created_at: str
    updated_at: str


class JobDetailResponse(JobStatusResponse):
    metrics: Dict[str, Any] = Field(default_factory=dict)
    matrix: Optional[Any] = None
    artifacts: Any = Field(default_factory=list)
