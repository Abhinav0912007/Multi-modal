"""Router: /api/pipeline — Run pipeline, stream progress via SSE, fetch results."""

import asyncio
import json
import traceback
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.services.job_manager import job_manager, PipelineConfig
from backend.services.pipeline_service import run_pipeline

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])
executor = ThreadPoolExecutor(max_workers=2)


class PipelineRunRequest(BaseModel):
    pair_id: str
    roi_src: list[int] = Field(default=[0, 6000, 0, 4000])
    roi_ref: list[int] = Field(default=[35000, 41000, 60000, 64000])
    transform_type: str = "homography"
    nfeatures: int = 15000
    ratio_thresh: float = 0.75
    grid_size: int = 8
    ransac_thresh: float = 3.0
    do_subpixel: bool = True


@router.post("/run")
async def run_pipeline_endpoint(req: PipelineRunRequest):
    """Launch the registration pipeline as a background job."""
    config = PipelineConfig(
        pair_id=req.pair_id,
        roi_src=tuple(req.roi_src),
        roi_ref=tuple(req.roi_ref),
        transform_type=req.transform_type,
        nfeatures=req.nfeatures,
        ratio_thresh=req.ratio_thresh,
        grid_size=(req.grid_size, req.grid_size),
        ransac_thresh=req.ransac_thresh,
        do_subpixel=req.do_subpixel,
    )

    job = job_manager.create_job(config)

    def _execute():
        try:
            def progress_cb(step, progress, message):
                job_manager.update_progress(job.job_id, step, progress, message)

            result = run_pipeline(config, progress_callback=progress_cb)
            job_manager.complete_job(
                job.job_id,
                metrics=result["metrics"],
                matrix=result["matrix"],
                artifacts=result["artifacts"],
            )
        except Exception as e:
            traceback.print_exc()
            job_manager.fail_job(job.job_id, str(e))

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _execute)

    return {"job_id": job.job_id, "status": "submitted"}


@router.get("/status/{job_id}")
async def stream_status(job_id: str):
    """SSE stream of pipeline progress events."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    queue = job_manager.get_event_queue(job_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Event queue not found")

    async def event_generator():
        # Send current state immediately
        yield f"data: {json.dumps({'type': 'init', 'status': job.status, 'progress': job.progress, 'step': job.current_step, 'message': job.step_message})}\n\n"

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("completed", "error"):
                    break
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                # Check if job is already done
                current = job_manager.get_job(job_id)
                if current and current.status in ("completed", "failed"):
                    yield f"data: {json.dumps({'type': current.status, 'metrics': current.metrics, 'artifacts': current.artifacts, 'error': current.error})}\n\n"
                    break

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/result/{job_id}")
def get_result(job_id: str):
    """Get final pipeline results for a completed job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job.to_dict()
