"""Router: /api/v1/roi and /api/v1/preview — Region of interest crops and thumbnail streams."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Response

from backend.schemas.roi import ROIRequest, ROICropResponse
from backend.services.roi_service import roi_service
from backend.services.raster_service import raster_service
from backend.services.pair_discovery import get_pair_paths

roi_router = APIRouter(prefix="/roi", tags=["v1-roi"])
preview_router = APIRouter(prefix="/preview", tags=["v1-preview"])


@roi_router.post("/crop", response_model=ROICropResponse)
def crop_roi_endpoint(req: ROIRequest):
    """Calculates ROI crop bounds and returns preview access URL."""
    try:
        roi = (req.ymin, req.ymax, req.xmin, req.xmax)
        arr, _ = roi_service.get_roi_crop(req.pair_id, req.target, roi)
        h, w = arr.shape[:2]
        return ROICropResponse(
            pair_id=req.pair_id,
            target=req.target,
            bounds=[req.ymin, req.ymax, req.xmin, req.xmax],
            width=w,
            height=h,
            preview_url=f"/api/v1/roi/preview/{req.pair_id}/{req.target}?ymin={req.ymin}&ymax={req.ymax}&xmin={req.xmin}&xmax={req.xmax}"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@roi_router.get("/preview/{pair_id}/{target}")
def get_roi_preview_image(
    pair_id: str,
    target: str,
    ymin: int = Query(0),
    ymax: int = Query(4000),
    xmin: int = Query(0),
    xmax: int = Query(4000),
    max_dim: int = Query(1024),
):
    """Streams a dynamic PNG preview of the specified ROI."""
    try:
        roi = (ymin, ymax, xmin, xmax)
        png_data = roi_service.get_roi_preview_png(pair_id, target, roi, max_dim=max_dim)
        return Response(content=png_data, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@preview_router.get("/{pair_id}/{target}")
def get_image_preview(
    pair_id: str,
    target: str,
    max_dim: int = Query(1024, description="Maximum width/height dimension")
):
    """Generates and streams a high-contrast thumbnail of a full source or reference scene."""
    try:
        paths = get_pair_paths(pair_id)
        file_path = paths["source"] if target == "source" else paths["reference"]
        png_data = raster_service.get_preview_png(file_path, max_dim=max_dim)
        return Response(content=png_data, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
