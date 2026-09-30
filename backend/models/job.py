"""Domain entities and data models for Chandracrawl."""

from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field
from datetime import datetime


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class TransformationType(str, Enum):
    HOMOGRAPHY = "homography"
    AFFINE = "affine"
    RIGID = "rigid"
    TPS = "tps"


class PipelineConfig(BaseModel):
    pair_id: str
    roi_src: Tuple[int, int, int, int] = (0, 6000, 0, 4000)
    roi_ref: Tuple[int, int, int, int] = (35000, 41000, 60000, 64000)
    transform_type: str = "homography"
    nfeatures: int = 15000
    ratio_thresh: float = 0.75
    grid_size: Tuple[int, int] = (8, 8)
    ransac_thresh: float = 3.0
    do_subpixel: bool = True


class Job(BaseModel):
    job_id: str
    config: PipelineConfig
    status: JobStatus = JobStatus.QUEUED
    progress: int = 0
    current_step: int = 0
    total_steps: int = 10
    step_message: str = "Queued in processing pool"
    metrics: Dict[str, Any] = Field(default_factory=dict)
    matrix: Optional[Any] = None
    artifacts: Any = Field(default_factory=list)
    error: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
