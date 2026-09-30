"""
Module: src/visualization.py
Description: Generates high-quality lunar match visualizations, spatial grids, overlays, and checkerboards.
"""

import os
import cv2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches


def save_image(img, path):
    """
    Saves an image to disk, creating directories if needed.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, img)
    print(f"[Visualization] Saved: {path}")


def draw_matches_side_by_side(src_img, kp_src, ref_img, kp_ref, matches, inliers_mask=None, max_draw=150):
    """
    Draws side-by-side keypoint correspondences with lines connecting matches.
    If inliers_mask is provided, inliers are drawn in green and outliers in red.
    """
    h_src, w_src = src_img.shape[:2]
    h_ref, w_ref = ref_img.shape[:2]

    # Convert to 3-channel BGR for colored lines
    src_bgr = cv2.cvtColor(src_img, cv2.COLOR_GRAY2BGR) if len(src_img.shape) == 2 else src_img.copy()
    ref_bgr = cv2.cvtColor(ref_img, cv2.COLOR_GRAY2BGR) if len(ref_img.shape) == 2 else ref_img.copy()

    canvas_h = max(h_src, h_ref)
    canvas_w = w_src + w_ref
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

    canvas[:h_src, :w_src] = src_bgr
    canvas[:h_ref, w_src:w_src + w_ref] = ref_bgr

    draw_list = list(enumerate(matches))
    if len(draw_list) > max_draw:
        # Sample evenly across the list
        step = len(draw_list) // max_draw
        draw_list = draw_list[::step][:max_draw]

    for orig_idx, m in draw_list:
        pt_s = tuple(np.round(kp_src[m.queryIdx].pt).astype(int))
        pt_r = tuple(np.round(kp_ref[m.trainIdx].pt).astype(int))
        pt_r_offset = (pt_r[0] + w_src, pt_r[1])

        is_inlier = True if inliers_mask is None else bool(inliers_mask[orig_idx])
        color = (0, 255, 0) if is_inlier else (0, 0, 255)  # Green for inlier, Red for outlier

        cv2.circle(canvas, pt_s, 4, color, -1)
        cv2.circle(canvas, pt_r_offset, 4, color, -1)
        cv2.line(canvas, pt_s, pt_r_offset, color, 1, cv2.LINE_AA)

    return canvas


def draw_spatial_distribution_grid(ref_img, inlier_ref_pts, grid_size=(8, 8), output_path=None):
    """
    Plots an 8x8 grid on the reference image showing the spatial distribution and count of inliers.
    """
    h, w = ref_img.shape[:2]
    grid_rows, grid_cols = grid_size
    cell_h = h / grid_rows
    cell_w = w / grid_cols

    fig, ax = plt.subplots(figsize=(10, 8), dpi=150)
    ax.imshow(ref_img, cmap="gray")

    # Draw grid lines and count labels
    cell_counts = np.zeros((grid_rows, grid_cols), dtype=int)
    for pt in inlier_ref_pts:
        rx, ry = pt
        c = int(min(max(rx // cell_w, 0), grid_cols - 1))
        r = int(min(max(ry // cell_h, 0), grid_rows - 1))
        cell_counts[r, c] += 1

    # Plot inlier points
    if len(inlier_ref_pts) > 0:
        ax.scatter(inlier_ref_pts[:, 0], inlier_ref_pts[:, 1], c="cyan", s=12, alpha=0.8, edgecolors="blue", label="Inlier Matches")

    for r in range(grid_rows):
        for c in range(grid_cols):
            rect = patches.Rectangle(
                (c * cell_w, r * cell_h), cell_w, cell_h,
                linewidth=1.0, edgecolor="yellow", facecolor="none", alpha=0.7
            )
            ax.add_patch(rect)
            count = cell_counts[r, c]
            color = "lime" if count > 0 else "orange"
            ax.text(
                c * cell_w + cell_w * 0.5, r * cell_h + cell_h * 0.5,
                str(count),
                color=color, fontsize=8, fontweight="bold",
                ha="center", va="center",
                bbox=dict(boxstyle="round,pad=0.2", facecolor="black", alpha=0.5)
            )

    ax.set_title(f"Spatial Inlier Distribution ({grid_rows}x{grid_cols} Grid) | Total Inliers: {len(inlier_ref_pts)}", fontsize=11)
    ax.set_xlim(0, w)
    ax.set_ylim(h, 0)
    ax.axis("off")
    plt.tight_layout()

    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        plt.savefig(output_path, bbox_inches="tight", dpi=150)
        plt.close(fig)
        print(f"[Visualization] Saved: {output_path}")
    else:
        plt.close(fig)


def create_blended_overlay(ref_img, registered_img, alpha=0.5):
    """
    Creates an alpha-blended transparency overlay between reference and registered source.
    Highlights overlapping lunar topography (craters, ridges).
    """
    # Ensure both are grayscale 8-bit
    ref_gray = ref_img if len(ref_img.shape) == 2 else cv2.cvtColor(ref_img, cv2.COLOR_BGR2GRAY)
    reg_gray = registered_img if len(registered_img.shape) == 2 else cv2.cvtColor(registered_img, cv2.COLOR_BGR2GRAY)

    if ref_gray.shape != reg_gray.shape:
        reg_gray = cv2.resize(reg_gray, (ref_gray.shape[1], ref_gray.shape[0]))

    # False-color overlay: Reference in Green, Registered Source in Magenta
    overlay_color = np.zeros((ref_gray.shape[0], ref_gray.shape[1], 3), dtype=np.uint8)
    overlay_color[:, :, 1] = ref_gray  # Green channel = Reference
    overlay_color[:, :, 0] = reg_gray  # Blue channel = Registered
    overlay_color[:, :, 2] = reg_gray  # Red channel = Registered (Red+Blue = Magenta)

    # Standard 50/50 blend
    blend_50_50 = cv2.addWeighted(ref_gray, 1.0 - alpha, reg_gray, alpha, 0)

    return blend_50_50, overlay_color


def create_checkerboard(img1, img2, square_size=128):
    """
    Generates a checkerboard composite of two registered images to visually inspect alignment.
    """
    h1, w1 = img1.shape[:2]
    h2, w2 = img2.shape[:2]
    h = min(h1, h2)
    w = min(w1, w2)
    
    gray1 = img1[:h, :w] if len(img1.shape) == 2 else cv2.cvtColor(img1[:h, :w], cv2.COLOR_BGR2GRAY)
    gray2 = img2[:h, :w] if len(img2.shape) == 2 else cv2.cvtColor(img2[:h, :w], cv2.COLOR_BGR2GRAY)
    
    out = np.zeros((h, w), dtype=np.uint8)
    for y in range(0, h, square_size):
        for x in range(0, w, square_size):
            y_end = min(y + square_size, h)
            x_end = min(x + square_size, w)
            if ((x // square_size) + (y // square_size)) % 2 == 0:
                out[y:y_end, x:x_end] = gray1[y:y_end, x:x_end]
            else:
                out[y:y_end, x:x_end] = gray2[y:y_end, x:x_end]
    return out

