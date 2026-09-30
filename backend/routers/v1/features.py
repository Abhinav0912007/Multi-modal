"""Router: /api/v1/preprocessing, /api/v1/features, and /api/v1/spatial."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Response
import numpy as np

from backend.schemas.preprocessing import PreprocessingRequest, PreprocessingResponse
from backend.schemas.features import (
    FeatureExtractRequest,
    FeatureExtractResponse,
    FeatureMatchRequest,
    FeatureMatchResponse,
    SpatialAnalysisRequest,
    SpatialAnalysisResponse,
    SpatialCellInfo,
    KeypointData,
)
from backend.services.roi_service import roi_service
from backend.services.feature_service import feature_service
from backend.services.pair_discovery import get_pair_paths
from backend.processing.preprocessing import ImagePreprocessor
from backend.utils.imaging import array_to_png_bytes, normalize_to_uint8

prep_router = APIRouter(prefix="/preprocessing", tags=["v1-preprocessing"])
feat_router = APIRouter(prefix="/features", tags=["v1-features"])
spatial_router = APIRouter(prefix="/spatial", tags=["v1-spatial"])


@prep_router.post("/apply", response_model=PreprocessingResponse)
def apply_preprocessing(req: PreprocessingRequest):
    """Applies radiometric enhancement (CLAHE, denoise, stretch) without blocking."""
    try:
        roi = tuple(req.roi) if req.roi else (0, 3000, 0, 3000)
        arr, _ = roi_service.get_roi_crop(req.pair_id, req.target, roi)

        preprocessor = ImagePreprocessor(
            clip_limit=req.clip_limit,
            tile_grid_size=(req.tile_grid_size, req.tile_grid_size),
        )
        u8 = normalize_to_uint8(arr)
        processed = preprocessor.process(u8)

        mean_val = float(np.mean(processed))
        std_val = float(np.std(processed))
        contrast = float(std_val / (mean_val + 1e-5))

        return PreprocessingResponse(
            pair_id=req.pair_id,
            target=req.target,
            processed_preview_url=f"/api/v1/roi/preview/{req.pair_id}/{req.target}",
            mean_intensity=round(mean_val, 2),
            std_intensity=round(std_val, 2),
            contrast_ratio=round(contrast, 3)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@feat_router.post("/extract", response_model=FeatureExtractResponse)
def extract_features_endpoint(req: FeatureExtractRequest):
    """Extracts SIFT/ORB keypoints from a dataset scene."""
    try:
        roi = tuple(req.roi) if req.roi else (0, 3000, 0, 3000)
        arr, _ = roi_service.get_roi_crop(req.pair_id, req.target, roi)

        kp, desc = feature_service.extract_features(arr, method=req.method, nfeatures=req.nfeatures)

        sample = [
            KeypointData(
                x=float(k.pt[0]),
                y=float(k.pt[1]),
                size=float(k.size),
                response=float(k.response)
            ) for k in kp[:50]
        ]

        return FeatureExtractResponse(
            pair_id=req.pair_id,
            target=req.target,
            method=req.method,
            keypoints_count=len(kp),
            sample_keypoints=sample,
            preview_url=f"/api/v1/roi/preview/{req.pair_id}/{req.target}"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@feat_router.post("/match", response_model=FeatureMatchResponse)
def match_features_endpoint(req: FeatureMatchRequest):
    """Computes feature matches between source and reference scenes."""
    try:
        paths = get_pair_paths(req.pair_id)
        roi_src = tuple(req.roi_src) if req.roi_src else (0, 3000, 0, 3000)
        roi_ref = tuple(req.roi_ref) if req.roi_ref else (0, 3000, 0, 3000)

        arr_src, _ = roi_service.get_roi_crop(req.pair_id, "source", roi_src)
        arr_ref, _ = roi_service.get_roi_crop(req.pair_id, "reference", roi_ref)

        results = feature_service.match_features(
            arr_src, arr_ref,
            method=req.method,
            ratio_thresh=req.ratio_thresh,
            do_subpixel=req.do_subpixel
        )

        n_raw = len(results["raw_matches"])
        n_filt = len(results["filtered_matches"])
        ratio = round(n_filt / max(1, n_raw), 4)

        return FeatureMatchResponse(
            pair_id=req.pair_id,
            total_raw_matches=n_raw,
            ratio_passed_matches=n_raw,
            inlier_matches=n_filt,
            inlier_ratio=ratio,
            matches_preview_url=f"/api/v1/features/matches-preview/{req.pair_id}"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@feat_router.get("/matches-preview/{pair_id}")
def stream_matches_preview(pair_id: str):
    """Streams visual correspondence lines across source and reference images."""
    try:
        arr_src, _ = roi_service.get_roi_crop(pair_id, "source", (0, 3000, 0, 3000))
        arr_ref, _ = roi_service.get_roi_crop(pair_id, "reference", (0, 3000, 0, 3000))

        results = feature_service.match_features(arr_src, arr_ref, nfeatures=5000)
        png = feature_service.render_matches_preview(
            arr_src, arr_ref,
            results["keypoints_src"],
            results["keypoints_ref"],
            results["filtered_matches"]
        )
        return Response(content=png, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@spatial_router.post("/analyze", response_model=SpatialAnalysisResponse)
def analyze_spatial_distribution(req: SpatialAnalysisRequest):
    """Analyzes spatial bucket distribution and coverage score."""
    try:
        arr_src, _ = roi_service.get_roi_crop(req.pair_id, "source", (0, 3000, 0, 3000))
        arr_ref, _ = roi_service.get_roi_crop(req.pair_id, "reference", (0, 3000, 0, 3000))

        results = feature_service.match_features(arr_src, arr_ref, grid_size=(req.grid_size, req.grid_size))
        matches = results["filtered_matches"]
        kps = results["keypoints_src"]

        h, w = arr_src.shape[:2]
        gh, gw = req.grid_size, req.grid_size
        grid_counts = np.zeros((gh, gw), dtype=int)

        for m in matches:
            x, y = kps[m.queryIdx].pt
            col = min(gw - 1, max(0, int(x / w * gw)))
            row = min(gh - 1, max(0, int(y / h * gh)))
            grid_counts[row, col] += 1

        active = int(np.sum(grid_counts > 0))
        total = gh * gw
        coverage_pct = round((active / total) * 100.0, 1)

        cells = [
            SpatialCellInfo(
                row=r,
                col=c,
                matches_count=int(grid_counts[r, c]),
                coverage_score=round(float(grid_counts[r, c]) / max(1, len(matches)), 3)
            )
            for r in range(gh) for c in range(gw)
        ]

        return SpatialAnalysisResponse(
            pair_id=req.pair_id,
            grid_size=req.grid_size,
            total_cells=total,
            active_cells=active,
            spatial_coverage_pct=coverage_pct,
            distribution_score=round(active / total, 3),
            cells=cells,
            heatmap_url=f"/api/v1/roi/preview/{req.pair_id}/source"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
