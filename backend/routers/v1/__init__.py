"""API v1 master router aggregating all modular endpoints under /api/v1."""

from fastapi import APIRouter

from backend.routers.v1.jobs import router as jobs_router
from backend.routers.v1.datasets import router as datasets_router
from backend.routers.v1.roi import roi_router, preview_router
from backend.routers.v1.features import prep_router, feat_router, spatial_router
from backend.routers.v1.alignment import align_router, trans_router, export_router

api_v1_router = APIRouter(prefix="/api/v1")

# Mount sub-routers
api_v1_router.include_router(jobs_router)
api_v1_router.include_router(datasets_router)
api_v1_router.include_router(roi_router)
api_v1_router.include_router(preview_router)
api_v1_router.include_router(prep_router)
api_v1_router.include_router(feat_router)
api_v1_router.include_router(spatial_router)
api_v1_router.include_router(align_router)
api_v1_router.include_router(trans_router)
api_v1_router.include_router(export_router)

__all__ = ["api_v1_router"]
