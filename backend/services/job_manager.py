"""
Job Manager: in-memory pipeline job tracking and SSE progress streaming.
"""

import uuid
import asyncio
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PipelineConfig:
    pair_id: str
    roi_src: tuple  # (line_start, line_end, sample_start, sample_end)
    roi_ref: tuple  # (y0, y1, x0, x1)
    transform_type: str = "homography"
    nfeatures: int = 15000
    ratio_thresh: float = 0.75
    grid_size: tuple = (8, 8)
    ransac_thresh: float = 3.0
    do_subpixel: bool = True


@dataclass
class PipelineJob:
    job_id: str
    config: PipelineConfig
    status: str = "pending"  # pending | running | completed | failed
    progress: int = 0
    current_step: int = 0
    total_steps: int = 10
    step_message: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    metrics: Optional[dict] = None
    matrix: Optional[list] = None
    artifacts: list = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self):
        return {
            "job_id": self.job_id,
            "pair_id": self.config.pair_id,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "step_message": self.step_message,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "metrics": self.metrics,
            "matrix": self.matrix,
            "artifacts": self.artifacts,
            "error": self.error,
        }


class JobManager:
    """Thread-safe in-memory job store with SSE event broadcasting."""

    def __init__(self):
        self._jobs: dict[str, PipelineJob] = {}
        self._events: dict[str, asyncio.Queue] = {}

    def create_job(self, config: PipelineConfig) -> PipelineJob:
        job_id = str(uuid.uuid4())[:8]
        job = PipelineJob(job_id=job_id, config=config)
        self._jobs[job_id] = job
        self._events[job_id] = asyncio.Queue()
        return job

    def get_job(self, job_id: str) -> Optional[PipelineJob]:
        return self._jobs.get(job_id)

    def update_progress(self, job_id: str, step: int, progress: int, message: str):
        job = self._jobs.get(job_id)
        if job:
            job.current_step = step
            job.progress = progress
            job.step_message = message
            job.status = "running"
            self._push_event(job_id, {
                "type": "progress",
                "step": step,
                "total": job.total_steps,
                "progress": progress,
                "message": message,
            })

    def complete_job(self, job_id: str, metrics: dict, matrix, artifacts: list):
        job = self._jobs.get(job_id)
        if job:
            job.status = "completed"
            job.progress = 100
            job.completed_at = datetime.utcnow()
            job.metrics = metrics
            job.matrix = matrix.tolist() if hasattr(matrix, 'tolist') else matrix
            job.artifacts = artifacts
            job.step_message = "Pipeline completed successfully"
            self._push_event(job_id, {
                "type": "completed",
                "progress": 100,
                "metrics": metrics,
                "artifacts": artifacts,
            })

    def fail_job(self, job_id: str, error: str):
        job = self._jobs.get(job_id)
        if job:
            job.status = "failed"
            job.completed_at = datetime.utcnow()
            job.error = error
            job.step_message = f"Failed: {error}"
            self._push_event(job_id, {
                "type": "error",
                "error": error,
            })

    def _push_event(self, job_id: str, event: dict):
        queue = self._events.get(job_id)
        if queue:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def get_event_queue(self, job_id: str) -> Optional[asyncio.Queue]:
        return self._events.get(job_id)

    def list_jobs(self) -> list[dict]:
        return [j.to_dict() for j in self._jobs.values()]


# Singleton instance
job_manager = JobManager()
