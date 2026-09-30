"""Router: /api/v1/registration/jobs & /api/v1/jobs/{job_id} — Job-based asynchronous processing."""

import asyncio
import json
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from backend.schemas.jobs import JobCreateRequest, JobCreateResponse, JobStatusResponse, JobDetailResponse
from backend.services.registration_service import registration_service

router = APIRouter(tags=["v1-jobs"])


@router.post("/registration/jobs", response_model=JobCreateResponse, status_code=202)
async def submit_registration_job(req: JobCreateRequest):
    """
    Submits a long-running registration job.
    Does NOT block the HTTP request; immediately returns { "job_id": "...", "status": "queued" }.
    """
    job = registration_service.create_registration_job(req)
    return JobCreateResponse(
        job_id=job.job_id,
        status=job.status,
        message="Registration job successfully queued"
    )


@router.get("/jobs/{job_id}", response_model=JobDetailResponse)
async def get_job_status(job_id: str):
    """
    Fetches the status and metrics of a job.
    Supports statuses: queued, processing, completed, failed.
    """
    job = registration_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    return JobDetailResponse(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        current_step=job.current_step,
        total_steps=job.total_steps,
        step_message=job.step_message,
        metrics=job.metrics,
        matrix=job.matrix,
        artifacts=job.artifacts,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    """Server-Sent Events (SSE) endpoint for real-time progress streaming."""
    job = registration_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    queue = registration_service.register_event_queue(job_id)

    async def sse_generator():
        try:
            # Yield initial status
            init_event = {
                "type": "init",
                "job_id": job.job_id,
                "status": job.status.value,
                "progress": job.progress,
                "step": job.current_step,
                "total_steps": job.total_steps,
                "message": job.step_message,
            }
            yield f"data: {json.dumps(init_event)}\n\n"

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("type") in ("completed", "error"):
                        break
                except asyncio.TimeoutError:
                    # Heartbeat keepalive
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    current = registration_service.get_job(job_id)
                    if current and current.status.value in ("completed", "failed"):
                        yield f"data: {json.dumps({'type': current.status.value, 'metrics': current.metrics, 'artifacts': current.artifacts})}\n\n"
                        break
        finally:
            registration_service.remove_event_queue(job_id, queue)

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.websocket("/ws/jobs/{job_id}")
async def websocket_job_telemetry(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for bidirectional real-time job telemetry."""
    job = registration_service.get_job(job_id)
    if not job:
        await websocket.close(code=1008, reason=f"Job '{job_id}' not found")
        return

    await websocket.accept()
    registration_service.register_ws_client(job_id, websocket)

    try:
        # Send initial snapshot
        await websocket.send_json({
            "type": "init",
            "job_id": job.job_id,
            "status": job.status.value,
            "progress": job.progress,
            "step": job.current_step,
            "message": job.step_message
        })

        while True:
            # Keep socket open and listen for client messages / pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        registration_service.remove_ws_client(job_id, websocket)
