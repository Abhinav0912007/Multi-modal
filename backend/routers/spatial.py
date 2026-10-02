"""
Router: /api/spatial — Spatial Grid & Inlier Density Analysis Workspace
Computes spatial distribution, grid density histograms, uniformity entropy, and quadrant coverage.
"""

import sys
import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.config import PROJECT_ROOT

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.routers.features import match_features, FeatureMatchRequest

router = APIRouter(prefix="/api/spatial", tags=["spatial"])


class SpatialAnalyzeRequest(BaseModel):
    pair_id: str = "pair_001"
    grid_rows: int = Field(default=8, ge=2, le=32)
    grid_cols: int = Field(default=8, ge=2, le=32)
    min_inliers_per_cell: int = Field(default=2, ge=1, le=50)
    roi_src: list[int] = Field(default=[0, 2000, 0, 2000])
    roi_ref: list[int] = Field(default=[35000, 37000, 60000, 62000])


def _compute_raster_spatial_grid(inlier_pts_list, outlier_pts_list, img_h, img_w, grid_r, grid_c, min_inliers_per_cell):
    inlier_pts = np.array(inlier_pts_list, dtype=np.float32) if len(inlier_pts_list) > 0 else np.empty((0, 2), dtype=np.float32)
    outlier_pts = np.array(outlier_pts_list, dtype=np.float32) if len(outlier_pts_list) > 0 else np.empty((0, 2), dtype=np.float32)
    
    total_inliers = len(inlier_pts)
    total_outliers = len(outlier_pts)
    
    cell_h = img_h / grid_r
    cell_w = img_w / grid_c

    inlier_grid = np.zeros((grid_r, grid_c), dtype=int)
    outlier_grid = np.zeros((grid_r, grid_c), dtype=int)

    # Bin inliers
    for pt in inlier_pts:
        c = int(min(max(pt[0] // cell_w, 0), grid_c - 1))
        r = int(min(max(pt[1] // cell_h, 0), grid_r - 1))
        inlier_grid[r, c] += 1

    # Bin outliers
    for pt in outlier_pts:
        c = int(min(max(pt[0] // cell_w, 0), grid_c - 1))
        r = int(min(max(pt[1] // cell_h, 0), grid_r - 1))
        outlier_grid[r, c] += 1

    total_cells = grid_r * grid_c
    active_cells = int(np.count_nonzero(inlier_grid >= min_inliers_per_cell))
    empty_cells = int(np.count_nonzero(inlier_grid == 0))
    deficient_cells = total_cells - active_cells - empty_cells
    coverage_ratio = float(active_cells / total_cells) if total_cells > 0 else 0.0

    # Uniformity & Entropy metrics
    active_counts = inlier_grid[inlier_grid > 0]
    if len(active_counts) > 0:
        mean_density = float(np.mean(active_counts))
        std_density = float(np.std(active_counts))
        cv = float(std_density / mean_density) if mean_density > 0 else 0.0
        # Shannon entropy normalized to [0, 1]
        probs = active_counts / np.sum(active_counts)
        entropy = float(-np.sum(probs * np.log2(probs + 1e-12)))
        max_entropy = float(np.log2(len(active_counts))) if len(active_counts) > 1 else 1.0
        uniformity_index = float(entropy / max_entropy) if max_entropy > 0 else 1.0
    else:
        mean_density, std_density, cv, uniformity_index = 0.0, 0.0, 0.0, 0.0

    # Quadrant analysis (NW, NE, SW, SE)
    mid_r = grid_r // 2
    mid_c = grid_c // 2
    quad_nw = int(np.sum(inlier_grid[:mid_r, :mid_c]))
    quad_ne = int(np.sum(inlier_grid[:mid_r, mid_c:]))
    quad_sw = int(np.sum(inlier_grid[mid_r:, :mid_c]))
    quad_se = int(np.sum(inlier_grid[mid_r:, mid_c:]))

    quad_counts = [quad_nw, quad_ne, quad_sw, quad_se]
    min_quad = min(quad_counts)
    if min_quad == 0:
        assessment = "CRITICAL — EMPTY QUADRANT DETECTED (High Risk of Planar Tilt)"
        assessment_level = "critical"
    elif min_quad < 5 or coverage_ratio < 0.5:
        assessment = "WARNING — NON-UNIFORM CLUSTERING (Sub-optimal Geometric Constraint)"
        assessment_level = "warning"
    else:
        assessment = "OPTIMAL — WELL DISTRIBUTED PLANAR CONSTRAINTS (Reliable RANSAC Geometry)"
        assessment_level = "optimal"

    # Assemble structured cell data for frontend rendering
    cells = []
    for r in range(grid_r):
        for c in range(grid_c):
            cnt_in = int(inlier_grid[r, c])
            cnt_out = int(outlier_grid[r, c])
            status = 'active' if cnt_in >= min_inliers_per_cell else ('empty' if cnt_in == 0 else 'deficient')
            cells.append({
                "row": r,
                "col": c,
                "x0": round(float(c * cell_w), 1),
                "y0": round(float(r * cell_h), 1),
                "w": round(float(cell_w), 1),
                "h": round(float(cell_h), 1),
                "inliers": cnt_in,
                "outliers": cnt_out,
                "status": status,
            })

    return {
        "dimensions": {"width": img_w, "height": img_h},
        "cell_size_px": {"width": round(float(cell_w), 1), "height": round(float(cell_h), 1)},
        "inliers": inlier_pts.tolist(),
        "outliers": outlier_pts.tolist(),
        "cells": cells,
        "statistics": {
            "total_inliers": total_inliers,
            "total_outliers": total_outliers,
            "active_cells": active_cells,
            "empty_cells": empty_cells,
            "deficient_cells": deficient_cells,
            "coverage_ratio": round(coverage_ratio, 4),
            "coverage_percentage": round(coverage_ratio * 100, 1),
            "mean_inliers_per_active_cell": round(mean_density, 2),
            "max_inliers_in_cell": int(np.max(inlier_grid)) if total_cells > 0 else 0,
            "coefficient_of_variation": round(cv, 3),
            "spatial_uniformity_index": round(uniformity_index, 3),
            "quadrants": {
                "nw": quad_nw,
                "ne": quad_ne,
                "sw": quad_sw,
                "se": quad_se,
            },
            "assessment": assessment,
            "assessment_level": assessment_level,
        }
    }


@router.post("/analyze")
def analyze_spatial_distribution(req: SpatialAnalyzeRequest):
    """
    Computes spatial coverage, inlier density matrix, quadrant uniformity,
    and Shannon entropy for correspondence distribution analysis.
    """
    # 1. Obtain feature matching results from the scientific pipeline
    match_req = FeatureMatchRequest(
        pair_id=req.pair_id,
        roi_src=req.roi_src,
        roi_ref=req.roi_ref,
        nfeatures=3000,
        max_return_matches=1000
    )
    match_res = match_features(match_req)

    if req.pair_id == "pair_002" or match_res.get("status") == "band_extraction_required":
        return {
            "status": "band_extraction_required",
            "pair_id": req.pair_id,
            "grid_dimensions": {"rows": req.grid_rows, "cols": req.grid_cols, "total_cells": req.grid_rows * req.grid_cols},
            "cell_size_px": {"width": 0, "height": 0},
            "reference_image": "",
            "source_image": "",
            "dimensions": {"ref_h": 0, "ref_w": 0, "src_h": 0, "src_w": 0},
            "inliers": [],
            "outliers": [],
            "keypoints": [],
            "cells": [],
            "statistics": {
                "total_inliers": 0,
                "total_outliers": 0,
                "active_cells": 0,
                "empty_cells": req.grid_rows * req.grid_cols,
                "deficient_cells": 0,
                "coverage_ratio": 0.0,
                "coverage_percentage": 0.0,
                "mean_inliers_per_active_cell": 0.0,
                "max_inliers_in_cell": 0,
                "coefficient_of_variation": 0.0,
                "spatial_uniformity_index": 0.0,
                "quadrants": {"nw": 0, "ne": 0, "sw": 0, "se": 0},
                "assessment": "IIRS Hyperspectral band extraction required before spatial analysis.",
                "assessment_level": "critical",
            },
            "reference_data": None,
            "source_data": None,
        }

    ref_h, ref_w = match_res.get("reference_dimensions", [2000, 704])
    src_h, src_w = match_res.get("source_dimensions", [2000, 2000])

    matches = match_res.get("matches", [])
    ref_inliers = [m["ref_pt"] for m in matches if m.get("is_inlier", False)]
    ref_outliers = [m["ref_pt"] for m in matches if not m.get("is_inlier", False)]
    src_inliers = [m["source_pt"] for m in matches if m.get("is_inlier", False)]
    src_outliers = [m["source_pt"] for m in matches if not m.get("is_inlier", False)]

    grid_r = req.grid_rows
    grid_c = req.grid_cols

    ref_spatial = _compute_raster_spatial_grid(
        ref_inliers, ref_outliers, ref_h, ref_w, grid_r, grid_c, req.min_inliers_per_cell
    )
    src_spatial = _compute_raster_spatial_grid(
        src_inliers, src_outliers, src_h, src_w, grid_r, grid_c, req.min_inliers_per_cell
    )

    return {
        "status": "completed",
        "pair_id": req.pair_id,
        "grid_dimensions": {"rows": grid_r, "cols": grid_c, "total_cells": grid_r * grid_c},
        "cell_size_px": ref_spatial["cell_size_px"],
        "reference_image": match_res.get("reference_image", ""),
        "source_image": match_res.get("source_image", ""),
        "dimensions": {"ref_h": ref_h, "ref_w": ref_w, "src_h": src_h, "src_w": src_w},
        "inliers": ref_spatial["inliers"],
        "outliers": ref_spatial["outliers"],
        "keypoints": match_res.get("reference_keypoints", []),
        "cells": ref_spatial["cells"],
        "statistics": ref_spatial["statistics"],
        "reference_data": ref_spatial,
        "source_data": src_spatial,
    }
