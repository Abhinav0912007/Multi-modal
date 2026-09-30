"""ThreadPool asynchronous worker with live SSE and WebSocket event broadcasting."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set
import traceback

from backend.models.job import Job, JobStatus
from backend.workers.base import BaseJobWorker
from backend.utils.logger import get_logger

logger = get_logger("workers.thread_worker")


class ThreadPoolJobWorker(BaseJobWorker):
    """Executes long-running scientific image processing jobs in a thread pool."""

    def __init__(self, max_workers: int = 4):
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="scientific_worker_")
        self._jobs: Dict[str, Job] = {}
        self._event_queues: Dict[str, List[asyncio.Queue]] = {}
        self._ws_clients: Dict[str, Set[Any]] = {}

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def register_event_queue(self, job_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        if job_id not in self._event_queues:
            self._event_queues[job_id] = []
        self._event_queues[job_id].append(q)
        return q

    def remove_event_queue(self, job_id: str, q: asyncio.Queue) -> None:
        if job_id in self._event_queues and q in self._event_queues[job_id]:
            self._event_queues[job_id].remove(q)
            if not self._event_queues[job_id]:
                del self._event_queues[job_id]

    def register_ws_client(self, job_id: str, ws: Any) -> None:
        if job_id not in self._ws_clients:
            self._ws_clients[job_id] = set()
        self._ws_clients[job_id].add(ws)

    def remove_ws_client(self, job_id: str, ws: Any) -> None:
        if job_id in self._ws_clients and ws in self._ws_clients[job_id]:
            self._ws_clients[job_id].remove(ws)
            if not self._ws_clients[job_id]:
                del self._ws_clients[job_id]

    def _broadcast_event(self, job_id: str, event_data: Dict[str, Any]) -> None:
        # 1. Distribute to asyncio SSE event queues
        queues = self._event_queues.get(job_id, [])
        for q in list(queues):
            try:
                q.put_nowait(event_data)
            except Exception:
                pass

        # 2. Distribute to WebSockets
        clients = self._ws_clients.get(job_id, set())
        for ws in list(clients):
            try:
                asyncio.create_task(ws.send_json(event_data))
            except Exception:
                pass

    def submit_job(self, job: Job, task_func: Callable[..., Any], *args: Any, **kwargs: Any) -> str:
        job.status = JobStatus.QUEUED
        self._jobs[job.job_id] = job
        logger.info(f"Job {job.job_id} submitted to ThreadPool worker queue")

        def _runner():
            try:
                # Mark as processing
                self.update_job_status(
                    job.job_id,
                    status=JobStatus.PROCESSING,
                    progress=5,
                    step=1,
                    message="Initializing raster preprocessing & ROI windowing"
                )

                # Callback passed into scientific processing task
                def progress_callback(step: int, progress: int, message: str):
                    self.update_job_status(
                        job.job_id,
                        status=JobStatus.PROCESSING,
                        progress=progress,
                        step=step,
                        message=message
                    )

                result = task_func(*args, progress_callback=progress_callback, **kwargs)

                # Mark completed
                self.complete_job(
                    job.job_id,
                    metrics=result.get("metrics", {}),
                    matrix=result.get("matrix"),
                    artifacts=result.get("artifacts", {})
                )
            except Exception as exc:
                traceback.print_exc()
                logger.error(f"Error in scientific execution for job {job.job_id}: {exc}")
                self.fail_job(job.job_id, str(exc))

        # Dispatch execution without blocking
        self.executor.submit(_runner)
        return job.job_id

    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        progress: int,
        step: int,
        message: str,
        **kwargs: Any
    ) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return

        job.status = status
        job.progress = progress
        job.current_step = step
        job.step_message = message
        job.updated_at = datetime.utcnow().isoformat()

        event = {
            "type": "progress",
            "job_id": job_id,
            "status": status.value,
            "progress": progress,
            "step": step,
            "total_steps": job.total_steps,
            "message": message,
            "timestamp": job.updated_at,
        }
        self._broadcast_event(job_id, event)

    def complete_job(
        self,
        job_id: str,
        metrics: Dict[str, Any],
        matrix: Any,
        artifacts: Dict[str, str]
    ) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return

        if hasattr(matrix, "tolist"):
            matrix = matrix.tolist()

        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.current_step = job.total_steps
        job.step_message = "Registration pipeline completed successfully"
        job.metrics = metrics
        job.matrix = matrix
        job.artifacts = artifacts
        job.updated_at = datetime.utcnow().isoformat()

        event = {
            "type": "completed",
            "job_id": job_id,
            "status": JobStatus.COMPLETED.value,
            "progress": 100,
            "metrics": metrics,
            "artifacts": artifacts,
            "timestamp": job.updated_at,
        }
        self._broadcast_event(job_id, event)
        logger.info(f"Job {job_id} successfully COMPLETED")

    def fail_job(self, job_id: str, error_message: str) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return

        job.status = JobStatus.FAILED
        job.error = error_message
        job.step_message = f"Failed: {error_message}"
        job.updated_at = datetime.utcnow().isoformat()

        event = {
            "type": "error",
            "job_id": job_id,
            "status": JobStatus.FAILED.value,
            "error": error_message,
            "timestamp": job.updated_at,
        }
        self._broadcast_event(job_id, event)
        logger.error(f"Job {job_id} marked as FAILED: {error_message}")
