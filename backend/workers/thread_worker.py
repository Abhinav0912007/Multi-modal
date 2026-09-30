"""ThreadPool asynchronous worker with live SSE/WebSocket broadcasting and database persistence."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import os
import traceback
from typing import Any, Callable, Dict, List, Optional, Set

from backend.config import ARTIFACTS_DIR
from backend.models.job import Job, JobStatus
from backend.workers.base import BaseJobWorker
from backend.utils.logger import get_logger

logger = get_logger("workers.thread_worker")


class ThreadPoolJobWorker(BaseJobWorker):
    """Executes long-running scientific image processing jobs in a thread pool with DB persistence."""

    def __init__(self, max_workers: int = 4):
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="scientific_worker_")
        self._jobs: Dict[str, Job] = {}
        self._event_queues: Dict[str, List[asyncio.Queue]] = {}
        self._ws_clients: Dict[str, Set[Any]] = {}

    def get_job(self, job_id: str) -> Optional[Job]:
        # Check in-memory active jobs first
        if job_id in self._jobs:
            return self._jobs[job_id]

        # Fallback to database
        try:
            from backend.db.database import SessionLocal
            from backend.models.db_models import ProcessingJob
            db = SessionLocal()
            try:
                db_job = db.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
                if db_job:
                    from backend.models.job import PipelineConfig
                    config = PipelineConfig(pair_id=db_job.pair_id)
                    job = Job(
                        job_id=db_job.job_id,
                        config=config,
                        status=JobStatus(db_job.status),
                        progress=db_job.progress or 0,
                        current_step=db_job.current_step or 0,
                        total_steps=db_job.total_steps or 10,
                        step_message=db_job.step_message or "",
                        error=db_job.error_message,
                        created_at=db_job.started_at.isoformat() if db_job.started_at else "",
                        updated_at=db_job.completed_at.isoformat() if db_job.completed_at else "",
                    )
                    self._jobs[job_id] = job
                    return job
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Error querying job from DB: {e}")

        return None

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
        self._db_save_create(job)
        logger.info(f"Job {job.job_id} submitted to ThreadPool worker queue and saved to DB")

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

        self._db_save_update(job_id, status, progress, step, message)

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
        artifacts: Any
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

        self._db_save_complete(job_id, metrics, matrix, artifacts)

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
        logger.info(f"Job {job_id} successfully COMPLETED & persisted to database")

    def fail_job(self, job_id: str, error_message: str) -> None:
        job = self._jobs.get(job_id)
        if not job:
            return

        job.status = JobStatus.FAILED
        job.error = error_message
        job.step_message = f"Failed: {error_message}"
        job.updated_at = datetime.utcnow().isoformat()

        self._db_save_fail(job_id, error_message)

        event = {
            "type": "error",
            "job_id": job_id,
            "status": JobStatus.FAILED.value,
            "error": error_message,
            "timestamp": job.updated_at,
        }
        self._broadcast_event(job_id, event)
        logger.error(f"Job {job_id} marked as FAILED in database: {error_message}")

    # Database persistence helpers
    def _db_save_create(self, job: Job):
        try:
            from backend.db.database import SessionLocal
            from backend.models.db_models import ProcessingJob
            db = SessionLocal()
            try:
                db_job = ProcessingJob(
                    job_id=job.job_id,
                    pair_id=job.config.pair_id,
                    status=job.status.value,
                    progress=job.progress,
                    current_step=job.current_step,
                    total_steps=job.total_steps,
                    step_message=job.step_message,
                    config_json=job.config.model_dump_json() if hasattr(job.config, 'model_dump_json') else str(job.config),
                    started_at=datetime.utcnow()
                )
                db.add(db_job)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Database save error (create): {e}")

    def _db_save_update(self, job_id: str, status: JobStatus, progress: int, step: int, message: str):
        try:
            from backend.db.database import SessionLocal
            from backend.models.db_models import ProcessingJob
            db = SessionLocal()
            try:
                db_job = db.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
                if db_job:
                    db_job.status = status.value
                    db_job.progress = progress
                    db_job.current_step = step
                    db_job.step_message = message
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Database save error (update): {e}")

    def _db_save_complete(self, job_id: str, metrics: Dict[str, Any], matrix: Any, artifacts: Any):
        try:
            from backend.db.database import SessionLocal
            from backend.models.db_models import ProcessingJob, FeatureResult, TransformationResult, ExportArtifact
            db = SessionLocal()
            try:
                db_job = db.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
                if db_job:
                    db_job.status = "completed"
                    db_job.progress = 100
                    db_job.current_step = 10
                    db_job.step_message = "Registration pipeline completed successfully"
                    db_job.completed_at = datetime.utcnow()
                    if db_job.started_at:
                        db_job.elapsed_seconds = (db_job.completed_at - db_job.started_at).total_seconds()

                    # Save FeatureResult
                    feat = FeatureResult(
                        job_id=job_id,
                        method="sift",
                        source_keypoints=int(metrics.get("source_keypoints", 0)),
                        reference_keypoints=int(metrics.get("reference_keypoints", 0)),
                        raw_matches=int(metrics.get("good_matches", 0)),
                        inliers=int(metrics.get("inliers", 0)),
                        outliers=int(metrics.get("outliers", 0)),
                        inlier_ratio=float(metrics.get("inlier_ratio", 0.0)),
                        spatial_coverage_pct=float(metrics.get("spatial_coverage", 0.0)),
                        subpixel_refined=bool(metrics.get("subpixel_refined", True))
                    )
                    db.merge(feat)

                    # Save TransformationResult
                    trans = TransformationResult(
                        job_id=job_id,
                        transform_type="homography",
                        matrix_json=json.dumps(matrix) if matrix is not None else None,
                        rmse=float(metrics.get("mean_reprojection_error", 0.0)),
                        validation_status=metrics.get("validity_state", "VALID")
                    )
                    db.merge(trans)

                    # Save ExportArtifacts
                    art_list = artifacts if isinstance(artifacts, list) else list(artifacts.keys())
                    for art_name in art_list:
                        art = ExportArtifact(
                            job_id=job_id,
                            pair_id=db_job.pair_id,
                            filename=str(art_name),
                            file_path=os.path.join(ARTIFACTS_DIR, db_job.pair_id, str(art_name)),
                            format=str(art_name).split(".")[-1].upper(),
                            storage_url=f"/api/artifacts/{db_job.pair_id}/{art_name}"
                        )
                        db.add(art)

                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Database save error (complete): {e}")

    def _db_save_fail(self, job_id: str, error_message: str):
        try:
            from backend.db.database import SessionLocal
            from backend.models.db_models import ProcessingJob
            db = SessionLocal()
            try:
                db_job = db.query(ProcessingJob).filter(ProcessingJob.job_id == job_id).first()
                if db_job:
                    db_job.status = "failed"
                    db_job.error_message = error_message
                    db_job.step_message = f"Failed: {error_message}"
                    db_job.completed_at = datetime.utcnow()
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Database save error (fail): {e}")

    def list_historical_jobs(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            from backend.db.database import SessionLocal
            from backend.models.db_models import ProcessingJob
            db = SessionLocal()
            try:
                jobs = db.query(ProcessingJob).order_by(ProcessingJob.started_at.desc()).limit(limit).all()
                out = []
                for j in jobs:
                    metrics: Dict[str, Any] = {}
                    if j.features:
                        metrics["inliers"] = j.features.inliers
                        metrics["raw_matches"] = j.features.raw_matches
                        metrics["inlier_ratio"] = j.features.inlier_ratio
                        metrics["source_kps"] = j.features.source_keypoints
                        metrics["ref_kps"] = j.features.reference_keypoints
                    if j.transformation:
                        metrics["rmse"] = j.transformation.rmse
                        metrics["transform_type"] = j.transformation.transform_type

                    art_count = len(j.artifacts) if j.artifacts else 0

                    out.append({
                        "job_id": j.job_id,
                        "pair_id": j.pair_id,
                        "status": j.status,
                        "progress": j.progress,
                        "current_step": j.current_step,
                        "total_steps": j.total_steps,
                        "step_message": j.step_message,
                        "error_message": j.error_message,
                        "started_at": j.started_at.isoformat() if j.started_at else None,
                        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                        "elapsed_seconds": round(j.elapsed_seconds, 2) if j.elapsed_seconds else 0.0,
                        "metrics": metrics,
                        "artifacts_count": art_count,
                    })
                return out
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Database list error: {e}")
            return []
