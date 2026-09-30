"""
Router: /api/artifacts — Serve output files, catalog artifact status, and generate reports.
"""

import os
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.config import OUTPUTS_DIR
from backend.services.reporting_service import (
    get_artifacts_catalog,
    generate_all_scientific_artifacts,
    build_scientific_report_data,
)

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])


class GenerateReportRequest(BaseModel):
    roi_src: Optional[list[int]] = None
    roi_ref: Optional[list[int]] = None


@router.get("/{pair_id}")
def list_artifacts(pair_id: str):
    """
    List all known exportable artifacts for a pair with strict verification:
    - Status: READY if file exists on disk and size > 0
    - Status: FAILED (not generated) if file does not exist
    - Download URL provided only when status is READY
    """
    catalog = get_artifacts_catalog(pair_id)
    # Add legacy compatibility fields
    for item in catalog:
        item["name"] = item["filename"]
        item["size"] = item["size_bytes"]
        item["type"] = item["mime_type"]
    return catalog


@router.get("/{pair_id}/report")
def get_scientific_report(pair_id: str):
    """Fetch the structured JSON scientific registration report."""
    report = build_scientific_report_data(pair_id)
    return report


@router.post("/{pair_id}/generate-report")
def trigger_generate_report(pair_id: str, req: Optional[GenerateReportRequest] = None):
    """
    Action: 'Generate Scientific Report'.
    Generates all processing outputs (PDF report, HTML report, JSON report,
    transformation matrix in JSON/CSV, feature correspondences CSV/JSON,
    ROI info, spatial statistics, processing metadata, and GeoTIFF raster).
    """
    roi_s = req.roi_src if req else None
    roi_r = req.roi_ref if req else None

    try:
        catalog = generate_all_scientific_artifacts(pair_id, roi_src=roi_s, roi_ref=roi_r)
        report = build_scientific_report_data(pair_id, roi_src=roi_s, roi_ref=roi_r)
        return {
            "status": "success",
            "pair_id": pair_id,
            "message": "Scientific report and export artifacts successfully generated.",
            "artifacts": catalog,
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")


@router.get("/{pair_id}/{filename}")
def get_artifact(pair_id: str, filename: str, download: bool = False):
    """
    Serve a specific artifact file.
    Only allows downloads when the file genuinely exists on disk.
    """
    # Sanitize filename
    safe_filename = os.path.basename(filename)
    fpath = os.path.join(OUTPUTS_DIR, pair_id, safe_filename)

    if not os.path.exists(fpath) or not os.path.isfile(fpath):
        raise HTTPException(
            status_code=404,
            detail=f"Artifact not found or not yet generated: {pair_id}/{safe_filename}"
        )

    mime = _mime_type(safe_filename)
    headers = {}
    if download or mime in ("application/octet-stream", "text/csv", "application/pdf", "image/tiff"):
        headers["Content-Disposition"] = f'attachment; filename="{safe_filename}"'

    return FileResponse(fpath, media_type=mime, headers=headers, filename=safe_filename)


def _mime_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".json": "application/json",
        ".csv": "text/csv",
        ".pdf": "application/pdf",
        ".html": "text/html",
        ".txt": "text/plain",
    }.get(ext, "application/octet-stream")
