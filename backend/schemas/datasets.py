"""Pydantic schemas for datasets and metadata."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DatasetMetadata(BaseModel):
    instrument: str
    target_body: str = "Moon"
    spatial_resolution_m: Optional[float] = None
    bands: Optional[List[str]] = None
    projection: Optional[str] = None
    format: str = "GeoTIFF / PDS"
    attributes: Dict[str, Any] = Field(default_factory=dict)


class DatasetItem(BaseModel):
    id: str
    name: str
    type: str
    file_path: str
    exists: bool
    dimensions: Optional[List[int]] = None
    file_size_bytes: Optional[int] = None
    metadata: DatasetMetadata


class PairSummary(BaseModel):
    pair_id: str
    source_name: str
    reference_name: str
    source_instrument: str
    reference_instrument: str
    status: str
    description: Optional[str] = None


class PairDetail(PairSummary):
    source_path: str
    reference_path: str
    source_exists: bool
    reference_exists: bool
    source_metadata: Optional[Dict[str, Any]] = None
    reference_metadata: Optional[Dict[str, Any]] = None
    default_roi_src: List[int]
    default_roi_ref: List[int]
