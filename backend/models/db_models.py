"""SQLAlchemy ORM models for Chandracrawl data and job persistence.

Models:
1. Dataset: Mission metadata, instruments, target bodies, and footprint coverage.
2. DatasetAsset: File/object storage paths, checksums, and mime-types (no raw rasters in DB).
3. ImagePair: Source and reference pair relationships.
4. ROI: Region of interest coordinates and sub-scene bounds.
5. ProcessingJob: Asynchronous registration jobs and execution lifecycle.
6. FeatureResult: Keypoint counts, matches, and spatial coverage statistics.
7. TransformationResult: RANSAC transformation matrices and geometric residuals.
8. ExportArtifact: Generated GeoTIFFs, reports, and archive files.
"""

from datetime import datetime
import json
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from backend.db.database import Base


class Dataset(Base):
    """Catalog metadata for lunar datasets (Chandrayaan-1 / Chandrayaan-2)."""
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(String(128), unique=True, index=True, nullable=False)
    title = Column(String(256), nullable=False)
    mission = Column(String(64), index=True, nullable=False)
    instrument = Column(String(128), index=True, nullable=False)
    instrument_code = Column(String(32), index=True)
    product_type = Column(String(64))
    acquisition_time = Column(String(64))
    dimensions = Column(String(64))
    resolution = Column(String(32))
    format = Column(String(32))
    processing_status = Column(String(32), default="Ready")
    footprint_json = Column(Text)  # GeoJSON / bounding coordinates
    metadata_json = Column(Text)   # Instrument attributes (orbit, angle, bands)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assets = relationship("DatasetAsset", back_populates="dataset", cascade="all, delete-orphan")


class DatasetAsset(Base):
    """File or Object Storage reference for a dataset (PDS image, label, preview, GeoTIFF)."""
    __tablename__ = "dataset_assets"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    asset_type = Column(String(32), nullable=False)  # 'source', 'label', 'preview', 'metadata'
    file_path = Column(String(512), nullable=False)  # Local file path or S3/MinIO URI
    file_size_bytes = Column(Integer, default=0)
    mime_type = Column(String(64))
    sha256_hash = Column(String(64))
    storage_backend = Column(String(32), default="filesystem")  # 'filesystem', 's3', 'minio'
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="assets")


class ImagePair(Base):
    """Source and Reference dataset pair configuration."""
    __tablename__ = "image_pairs"

    id = Column(Integer, primary_key=True, index=True)
    pair_id = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(256))
    source_instrument = Column(String(64))
    reference_instrument = Column(String(64))
    source_path = Column(String(512))
    reference_path = Column(String(512))
    status = Column(String(32), default="ready")
    status_label = Column(String(64), default="Ready")
    default_roi_src = Column(String(128))  # JSON string e.g. "[0, 6000, 0, 4000]"
    default_roi_ref = Column(String(128))  # JSON string e.g. "[35000, 41000, 60000, 64000]"
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    jobs = relationship("ProcessingJob", back_populates="pair")
    rois = relationship("ROI", back_populates="pair")


class ROI(Base):
    """Region of Interest (ROI) selection bounds."""
    __tablename__ = "rois"

    id = Column(Integer, primary_key=True, index=True)
    pair_id = Column(String(64), ForeignKey("image_pairs.pair_id"), nullable=False)
    target = Column(String(32), nullable=False)  # 'source' or 'reference'
    ymin = Column(Integer, nullable=False)
    ymax = Column(Integer, nullable=False)
    xmin = Column(Integer, nullable=False)
    xmax = Column(Integer, nullable=False)
    width = Column(Integer)
    height = Column(Integer)
    preview_url = Column(String(512))
    created_at = Column(DateTime, default=datetime.utcnow)

    pair = relationship("ImagePair", back_populates="rois")


class ProcessingJob(Base):
    """Asynchronous pipeline execution record."""
    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), unique=True, index=True, nullable=False)
    pair_id = Column(String(64), ForeignKey("image_pairs.pair_id"), nullable=False)
    status = Column(String(32), default="queued", index=True)  # queued, processing, completed, failed
    progress = Column(Integer, default=0)
    current_step = Column(Integer, default=0)
    total_steps = Column(Integer, default=10)
    step_message = Column(String(256), default="Queued")
    config_json = Column(Text)  # Serialized PipelineConfig
    error_message = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    elapsed_seconds = Column(Float, default=0.0)

    # Relationships
    pair = relationship("ImagePair", back_populates="jobs")
    features = relationship("FeatureResult", back_populates="job", uselist=False, cascade="all, delete-orphan")
    transformation = relationship("TransformationResult", back_populates="job", uselist=False, cascade="all, delete-orphan")
    artifacts = relationship("ExportArtifact", back_populates="job", cascade="all, delete-orphan")


class FeatureResult(Base):
    """Keypoint detection and correspondence matching statistics."""
    __tablename__ = "feature_results"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey("processing_jobs.job_id"), unique=True, nullable=False)
    method = Column(String(32), default="sift")
    source_keypoints = Column(Integer, default=0)
    reference_keypoints = Column(Integer, default=0)
    raw_matches = Column(Integer, default=0)
    inliers = Column(Integer, default=0)
    outliers = Column(Integer, default=0)
    inlier_ratio = Column(Float, default=0.0)
    subpixel_refined = Column(Boolean, default=False)
    spatial_coverage_pct = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("ProcessingJob", back_populates="features")


class TransformationResult(Base):
    """RANSAC transformation matrix and geometric validation metrics."""
    __tablename__ = "transformation_results"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey("processing_jobs.job_id"), unique=True, nullable=False)
    transform_type = Column(String(32), default="homography")
    matrix_json = Column(Text)  # 3x3 matrix in JSON
    scale_x = Column(Float, default=1.0)
    scale_y = Column(Float, default=1.0)
    rotation_deg = Column(Float, default=0.0)
    translation_x = Column(Float, default=0.0)
    translation_y = Column(Float, default=0.0)
    rmse = Column(Float, default=0.0)
    condition_number = Column(Float, default=1.0)
    determinant = Column(Float, default=1.0)
    validation_status = Column(String(32), default="VALID")
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("ProcessingJob", back_populates="transformation")


class ExportArtifact(Base):
    """Deliverable artifacts (GeoTIFFs, reports, and matrix files)."""
    __tablename__ = "export_artifacts"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(64), ForeignKey("processing_jobs.job_id"), nullable=True)
    pair_id = Column(String(64), nullable=False)
    filename = Column(String(256), nullable=False)
    file_path = Column(String(512), nullable=False)
    format = Column(String(32))  # 'GeoTIFF', 'PNG', 'JSON', 'PDF', 'CSV'
    file_size_bytes = Column(Integer, default=0)
    storage_url = Column(String(512))
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("ProcessingJob", back_populates="artifacts")
