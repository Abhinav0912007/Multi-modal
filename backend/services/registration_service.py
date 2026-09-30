"""RegistrationService: High-level orchestrator for asynchronous job management and pipeline dispatch."""

import uuid
from typing import Any, Dict, Optional

from backend.models.job import Job, JobStatus, PipelineConfig
from backend.schemas.jobs import JobCreateRequest
from backend.services.pipeline_service import run_pipeline
from backend.workers import get_job_worker
from backend.utils.logger import get_logger

logger = get_logger("services.registration")


class RegistrationService:
    """Manages asynchronous registration jobs, lifecycle events, and scientific worker execution."""

    def __init__(self):
        self.worker = get_job_worker()

    def create_registration_job(self, req: JobCreateRequest) -> Job:
        """Creates a new Job in QUEUED state and dispatches it to the background worker."""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        config = PipelineConfig(
            pair_id=req.pair_id,
            roi_src=tuple(req.roi_src),
            roi_ref=tuple(req.roi_ref),
            transform_type=req.transform_type.value if hasattr(req.transform_type, "value") else str(req.transform_type),
            nfeatures=req.nfeatures,
            ratio_thresh=req.ratio_thresh,
            grid_size=(req.grid_size, req.grid_size),
            ransac_thresh=req.ransac_thresh,
            do_subpixel=req.do_subpixel,
        )

        job = Job(
            job_id=job_id,
            config=config,
            status=JobStatus.QUEUED,
            progress=0,
            current_step=0,
            total_steps=10,
            step_message="Queued for execution in scientific worker pool",
        )

        # Submit to background worker without blocking HTTP thread
        self.worker.submit_job(job, run_pipeline, config)
        logger.info(f"Created and enqueued registration job {job_id} for pair {req.pair_id}")
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        """Retrieves a job by its unique identifier."""
        return self.worker.get_job(job_id)

    def register_event_queue(self, job_id: str):
        """Subscribes an asyncio queue to receive live SSE events for a job."""
        return self.worker.register_event_queue(job_id)

    def remove_event_queue(self, job_id: str, queue):
        """Unsubscribes an SSE queue."""
        return self.worker.remove_event_queue(job_id, queue)

    def register_ws_client(self, job_id: str, ws: Any):
        """Registers a WebSocket connection to stream live job telemetry."""
        return self.worker.register_ws_client(job_id, ws)

    def remove_ws_client(self, job_id: str, ws: Any):
        """Unregisters a WebSocket client."""
        return self.worker.remove_ws_client(job_id, ws)


registration_service = RegistrationService()
