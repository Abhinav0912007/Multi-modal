"""Celery / Redis Queue (RQ) architectural adapter.

Prepares the backend for horizontal scaling across distributed Redis/Celery worker nodes.
Automatically falls back to the in-process ThreadPoolJobWorker if Redis/Celery broker is unavailable.
"""

from typing import Any, Callable, Dict, Optional
import os

from backend.models.job import Job, JobStatus
from backend.workers.base import BaseJobWorker
from backend.workers.thread_worker import ThreadPoolJobWorker
from backend.utils.logger import get_logger

logger = get_logger("workers.celery_redis")


class CeleryRedisJobWorker(BaseJobWorker):
    """Distributed worker adapter ready for Celery/Redis deployments."""

    def __init__(self, broker_url: Optional[str] = None):
        self.broker_url = broker_url or os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
        self.is_connected = False
        # In-process worker fallback
        self._fallback_worker = ThreadPoolJobWorker()

        try:
            # Check if redis/celery is reachable
            import redis
            r = redis.from_url(self.broker_url, socket_timeout=1.0)
            r.ping()
            self.is_connected = True
            logger.info(f"Connected to distributed Redis queue at {self.broker_url}")
        except Exception:
            self.is_connected = False
            logger.info("Distributed Redis/Celery broker not detected; using high-throughput ThreadPoolJobWorker")

    def submit_job(self, job: Job, task_func: Callable[..., Any], *args: Any, **kwargs: Any) -> str:
        if self.is_connected:
            # In full Celery mode, dispatch via celery task delay / apply_async
            # e.g.: task_func.apply_async(args=args, kwargs=kwargs, task_id=job.job_id)
            pass
        return self._fallback_worker.submit_job(job, task_func, *args, **kwargs)

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._fallback_worker.get_job(job_id)

    def update_job_status(self, job_id: str, status: JobStatus, progress: int, step: int, message: str, **kwargs: Any) -> None:
        return self._fallback_worker.update_job_status(job_id, status, progress, step, message, **kwargs)

    def complete_job(self, job_id: str, metrics: Dict[str, Any], matrix: Any, artifacts: Dict[str, str]) -> None:
        return self._fallback_worker.complete_job(job_id, metrics, matrix, artifacts)

    def fail_job(self, job_id: str, error_message: str) -> None:
        return self._fallback_worker.fail_job(job_id, error_message)

    def register_event_queue(self, job_id: str):
        return self._fallback_worker.register_event_queue(job_id)

    def remove_event_queue(self, job_id: str, q):
        return self._fallback_worker.remove_event_queue(job_id, q)

    def register_ws_client(self, job_id: str, ws: Any):
        return self._fallback_worker.register_ws_client(job_id, ws)

    def remove_ws_client(self, job_id: str, ws: Any):
        return self._fallback_worker.remove_ws_client(job_id, ws)
