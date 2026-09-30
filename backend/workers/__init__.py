"""Workers package factory."""

import os
from backend.workers.base import BaseJobWorker
from backend.workers.thread_worker import ThreadPoolJobWorker
from backend.workers.celery_redis_worker import CeleryRedisJobWorker

_worker_instance: BaseJobWorker = None


def get_job_worker() -> BaseJobWorker:
    """Singleton accessor for the active background processing worker."""
    global _worker_instance
    if _worker_instance is None:
        backend_type = os.getenv("WORKER_BACKEND", "thread").lower()
        if backend_type in ("celery", "redis", "rq"):
            _worker_instance = CeleryRedisJobWorker()
        else:
            _worker_instance = ThreadPoolJobWorker(max_workers=4)
    return _worker_instance


__all__ = ["get_job_worker", "BaseJobWorker", "ThreadPoolJobWorker", "CeleryRedisJobWorker"]
