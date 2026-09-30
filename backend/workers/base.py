"""Abstract worker interface for job-based asynchronous processing."""

from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, Optional
from backend.models.job import Job, JobStatus


class BaseJobWorker(ABC):
    """Abstract base worker for decoupled, asynchronous scientific image processing."""

    @abstractmethod
    def submit_job(self, job: Job, task_func: Callable[..., Any], *args: Any, **kwargs: Any) -> str:
        """Enqueue a job for execution without blocking the calling thread."""
        pass

    @abstractmethod
    def get_job(self, job_id: str) -> Optional[Job]:
        """Fetch the current state of a job."""
        pass

    @abstractmethod
    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        progress: int,
        step: int,
        message: str,
        **kwargs: Any,
    ) -> None:
        """Update job progress and broadcast events to connected clients."""
        pass

    @abstractmethod
    def complete_job(
        self,
        job_id: str,
        metrics: Dict[str, Any],
        matrix: Any,
        artifacts: Dict[str, str],
    ) -> None:
        """Mark job as completed and record final results."""
        pass

    @abstractmethod
    def fail_job(self, job_id: str, error_message: str) -> None:
        """Mark job as failed with an error message."""
        pass
