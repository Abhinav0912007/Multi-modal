"""
Module: src/spatial_filter.py
Description: Grid-based spatial filtering and spatial coverage evaluation for uniform match distribution.
"""

import numpy as np


def filter_matches_by_spatial_grid(src_pts, ref_pts, matches, ref_shape, grid_size=(8, 8), max_per_cell=25):
    """
    Divides the reference image domain into an MxN grid and enforces uniform spatial
    distribution by capping the number of matches per grid cell.
    """
    if len(matches) == 0:
        return src_pts, ref_pts, matches, {}

    h, w = ref_shape[:2]
    grid_rows, grid_cols = grid_size
    cell_h = h / grid_rows
    cell_w = w / grid_cols

    # Group matches by cell
    grid_bins = {}
    for idx, (s_pt, r_pt, m) in enumerate(zip(src_pts, ref_pts, matches)):
        rx, ry = r_pt
        col = int(min(max(rx // cell_w, 0), grid_cols - 1))
        row = int(min(max(ry // cell_h, 0), grid_rows - 1))
        cell_key = (row, col)

        if cell_key not in grid_bins:
            grid_bins[cell_key] = []
        grid_bins[cell_key].append((m.distance, idx, s_pt, r_pt, m))

    selected_indices = []
    cell_counts = np.zeros((grid_rows, grid_cols), dtype=int)

    for (r, c), items in grid_bins.items():
        # Sort items in cell by best match distance
        items.sort(key=lambda x: x[0])
        chosen = items[:max_per_cell]
        cell_counts[r, c] = len(chosen)
        for _, orig_idx, _, _, _ in chosen:
            selected_indices.append(orig_idx)

    selected_indices.sort()
    filt_src_pts = src_pts[selected_indices]
    filt_ref_pts = ref_pts[selected_indices]
    filt_matches = [matches[i] for i in selected_indices]

    print(f"[Spatial Filter] Retained {len(filt_matches)}/{len(matches)} matches across {len(grid_bins)}/{grid_rows*grid_cols} active grid cells.")
    return filt_src_pts, filt_ref_pts, filt_matches, cell_counts


def compute_spatial_coverage(inlier_ref_pts, ref_shape, grid_size=(8, 8)):
    """
    Calculates spatial distribution metrics:
    - active_cells: number of cells containing at least 1 inlier
    - total_cells: grid_rows * grid_cols
    - spatial_coverage_ratio: active_cells / total_cells
    - cell_counts_grid: 2D array of counts per cell
    """
    h, w = ref_shape[:2]
    grid_rows, grid_cols = grid_size
    cell_h = h / grid_rows
    cell_w = w / grid_cols

    cell_counts = np.zeros((grid_rows, grid_cols), dtype=int)

    for pt in inlier_ref_pts:
        rx, ry = pt
        col = int(min(max(rx // cell_w, 0), grid_cols - 1))
        row = int(min(max(ry // cell_h, 0), grid_rows - 1))
        cell_counts[row, col] += 1

    active_cells = int(np.count_nonzero(cell_counts > 0))
    total_cells = grid_rows * grid_cols
    coverage_ratio = float(active_cells / total_cells) if total_cells > 0 else 0.0

    return {
        "active_cells": active_cells,
        "total_cells": total_cells,
        "spatial_coverage_ratio": coverage_ratio,
        "cell_counts": cell_counts
    }
