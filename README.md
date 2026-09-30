# 🛰️ ISRO Chandrayaan-1 TMC Lunar Image Registration System

> **Sub-Pixel Multi-Sensor Geometric Registration of Chandrayaan-1 Terrain Mapping Camera (TMC) Rasters to Derived Ortho Lunar GeoTIFFs using Classical Computer Vision.**

---

## 📖 Executive Summary & Scientific Problem

The **Chandrayaan-1 Terrain Mapping Camera (TMC)** captured high-resolution stereo and nadir images of the Moon to generate 3D digital elevation models and lunar atlases. However, registering raw/calibrated PDS3/PDS4 orbital strips to orthorectified reference mosaics presents severe challenges:
1. **Multi-Gigabyte Scale**: Reference GeoTIFFs (such as `ch1_tmc_ndn_..._d_oth_d18.tif`) frequently exceed **18–20 GB** with dimensions like $76,212 \times 123,960$ pixels. Attempting to load these entirely into RAM causes memory exhaustion and system crashes.
2. **Illumination & Shadow Discrepancies**: Different solar elevation and azimuth angles create inverted crater shadows and low-contrast lunar regolith terrain.
3. **Orbital Line-Scan Distortion**: Raw source strips are pushed along the satellite track (e.g., $210,512 \times 4000$ pixels) and require precise non-linear projective (homography) or affine mapping.
4. **Spatial Match Clustering**: Feature matchers naturally latch onto prominent crater rims, leaving large areas under-constrained if not filtered uniformly across the spatial domain.

This repository provides a complete, robust, **classical Computer Vision (CV) pipeline** with memory-mapped direct seeking, adaptive percentile scaling, CLAHE contrast enhancement, SIFT feature extraction, FLANN Lowe's ratio matching, $8 \times 8$ uniform spatial grid filtering, RANSAC projective estimation, and Lucas-Kanade sub-pixel refinement.

---

## 🏗️ System Architecture & Data Flow

```
   ┌──────────────────────────────────────────────────────────┐
   │            SOURCE INPUT (PDS CALIBRATED STRIP)           │
   │  ch1_tmc_nca_..._Bundle.tar / .img + .xml metadata       │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼ [Step 1: PDS Parser & Memory-Mapped Slicing]
   ┌──────────────────────────────────────────────────────────┐
   │          REFERENCE INPUT (DERIVED ORTHO GEOTIFF)         │
   │  ch1_tmc_ndn_..._d_oth_d18.tif (Multi-GB 16-bit Raster)  │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼ [Step 2: Fast Direct Strip Seek / Auto-ROI]
                                │
   ┌────────────────────────────┴─────────────────────────────┐
   │ [Step 3: Preprocessing & Radiometric Normalization]      │
   │ - 1st to 99th Percentile Intensity Clipping              │
   │ - Contrast Limited Adaptive Histogram Equalization       │
   │   (CLAHE with Clip Limit = 2.5, Tile Grid = 8x8)         │
   │ - Fast Bilateral / Gaussian Denoising                    │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ [Step 4: Scale-Invariant Feature Extraction (SIFT)]      │
   │ - Multi-Scale DoG (Difference of Gaussians) Octaves      │
   │ - Gradient Orientation Histograms (128-d Descriptors)    │
   │ - Detect up to 15,000 Keypoints per Image                │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ [Step 5: FLANN Feature Matching & Lowe's Ratio Test]     │
   │ - Fast Approximate Nearest Neighbors (KD-Tree Index)     │
   │ - Lowe's Ambiguity Test: (d_best / d_second_best) < 0.75 │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ [Step 6: Uniform 8x8 Spatial Grid Distribution Filter]   │
   │ - Partitions Reference Space into 64 Cells               │
   │ - Caps Max Matches per Cell (Max = 30)                   │
   │ - Computes Spatial Surface Coverage Ratio                │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ [Step 7: RANSAC Outlier Rejection & Homography]          │
   │ - Random Sample Consensus over Candidate Correspondences │
   │ - Estimates Projective Transformation Matrix H (3x3)     │
   │ - Threshold = 3.0 px, Max Iterations = 3,000             │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ [Step 8: Sub-Pixel Lucas-Kanade Refinement]              │
   │ - Sub-pixel Intensity Gradient Optimization              │
   │ - 11x11 Patch Cross-Correlation Adjustment               │
   └────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ [Step 9: Perspective Warping & Alignment Verification]   │
   │ - Warps Source Strip into Reference Coordinate Space     │
   │ - 50/50 Alpha Crossfade & False-Color Anaglyph Overlays  │
   │ - Alternating Checkerboard Verification Pattern          │
   │ - Generates metrics.json, match_points.csv, matrix.json  │
   └──────────────────────────────────────────────────────────┘
```

---

## 🔬 Core Concepts & Mathematical Formulations

### 1. Zero-RAM Direct Strip Seeking (Multi-GB GeoTIFF I/O)
For uncompressed 16-bit GeoTIFFs ($76,212 \times 123,960 = 18.89\text{ GB}$), standard reading functions crash by allocating 19 GB of RAM.
- Each scanline $y$ is indexed by a file byte offset in `page.dataoffsets[y]`.
- To extract region $[y_0:y_1, x_0:x_1]$, we seek directly to `offset[y] + x0 * 2` and read $(x_1 - x_0) \times 2$ bytes.
- **Latency**: Slice extraction takes **$< 0.5\text{ seconds}$** with zero memory overhead.

### 2. Radiometric Enhancement (CLAHE + Percentile Scaling)
Raw 16-bit lunar sensor data typically occupies a narrow dynamic range (e.g., DN 400 to DN 3200).
- **Percentile Normalization**:
  $$I_{\text{norm}}(x, y) = \text{clip}\left(\frac{I(x,y) - P_1}{P_{99} - P_1}, 0, 1\right) \times 255$$
- **CLAHE**: Divides the image into contextual tiles ($8 \times 8$), clips histogram peaks above `clip_limit = 2.5` to prevent over-amplifying sensor noise, and interpolates bilinearly across tile borders.

### 3. SIFT & Lowe's Ratio Test
- **Scale Space**: Convolves image with Difference-of-Gaussian (DoG) kernels across multiple octaves:
  $$D(x, y, \sigma) = (G(x, y, k\sigma) - G(x, y, \sigma)) * I(x, y)$$
- **Lowe's Ratio Test**: Discards ambiguous or repetitive matches:
  $$\frac{\|\mathbf{d}_{\text{src}} - \mathbf{d}_{\text{ref, 1st}}\|_2}{\|\mathbf{d}_{\text{src}} - \mathbf{d}_{\text{ref, 2nd}}\|_2} < 0.75$$

### 4. Uniform $8 \times 8$ Spatial Grid Filtering
To prevent all tie points from clustering around a single prominent crater, the reference space is divided into an $8 \times 8$ grid ($64$ cells).
- An upper bound (e.g. 30 matches) is enforced per cell, sorted by Lowe's distance.
- **Spatial Coverage**:
  $$\text{Coverage Ratio} = \frac{\text{Active Cells with Inliers}}{\text{Total Grid Cells (64)}}$$

### 5. RANSAC Projective Transformation (Homography)
Relates coordinates $(x_s, y_s)$ from the source image to reference coordinates $(x_r, y_r)$ via a $3 \times 3$ matrix $\mathbf{H}$:
$$\begin{bmatrix} x_r' \\ y_r' \\ w_r' \end{bmatrix} = \begin{bmatrix} h_{00} & h_{01} & h_{02} \\ h_{10} & h_{11} & h_{12} \\ h_{20} & h_{21} & h_{22} \end{bmatrix} \begin{bmatrix} x_s \\ y_s \\ 1 \end{bmatrix}, \quad x_r = \frac{x_r'}{w_r'}, \quad y_r = \frac{y_r'}{w_r'}$$
- **Reprojection Error**:
  $$\epsilon_i = \sqrt{(x_{r,i} - \hat{x}_{r,i})^2 + (y_{r,i} - \hat{y}_{r,i})^2}$$
- Matches with $\epsilon_i < \text{threshold}$ (default: $3.0\text{ px}$) are classified as inliers.

### 6. Sub-Pixel Lucas-Kanade Refinement
For every inlier pair, a local $11 \times 11$ patch is extracted and iteratively solved for sub-pixel displacement $\Delta \mathbf{p} = (\Delta x, \Delta y)^T$:
$$\Delta \mathbf{p} = \left[ \sum \begin{bmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{bmatrix} \right]^{-1} \sum \begin{bmatrix} I_x \cdot (T - I) \\ I_y \cdot (T - I) \end{bmatrix}$$
Where $I_x, I_y$ are image spatial gradients.

---

## 📁 Repository Structure

```
sih/
├── data/
│   └── pairs/
│       └── pair_001/
│           ├── source/
│           │   ├── ch1_tmc_nca_20090529T0853239926_d_img_d18_Bundle.tar
│           │   └── extracted/
│           │       └── data/calibrated/20090529/
│           │           ├── ch1_tmc_nca_20090529T0853239926_d_img_d18.img
│           │           └── ch1_tmc_nca_20090529T0853239926_d_img_d18.xml
│           └── refrence/ (or reference/)
│               └── ch1_tmc_ndn_20090530T1441405667_d_oth_d18.tif
├── src/
│   ├── __init__.py
│   ├── tar_extractor.py       # Auto-discovers and unpacks PDS tar/zip bundles
│   ├── pds_reader.py          # Fast memory-mapped PDS and direct-seek GeoTIFF reader
│   ├── preprocessing.py       # Percentile scaling, 8-bit mapping & CLAHE contrast
│   ├── feature_matching.py    # SIFT detector + FLANN matching + Lowe's ratio
│   ├── spatial_filter.py      # Uniform 8x8 spatial grid filter & coverage metrics
│   ├── registration.py        # RANSAC Homography/Affine estimator & perspective warper
│   ├── subpixel.py            # Lucas-Kanade sub-pixel intensity refinement
│   ├── evaluation.py          # RMSE, inlier ratio, and JSON/CSV metrics generator
│   └── visualization.py       # Matches, spatial grids, alpha blends & checkerboards
├── outputs/
│   └── pair_001/
│       ├── source_processed.png       # Enhanced source crop
│       ├── reference_processed.png    # Enhanced reference crop
│       ├── good_matches.png           # All candidate feature matches
│       ├── inlier_matches.png         # Clean RANSAC inlier tie points
│       ├── spatial_distribution.png   # 8x8 spatial density & coverage map
│       ├── registered.png             # Warped source image
│       ├── overlay.png                # 50/50 transparency overlay
│       ├── checkerboard.png           # Alternating checkerboard alignment map
│       ├── transformation_matrix.json # 3x3 Homography matrix
│       ├── match_points.csv           # Matched coordinate pairs table
│       └── metrics.json               # Registration telemetry
├── app.py                     # Streamlit interactive web dashboard
├── main.py                    # Standalone CLI pipeline runner
├── requirements.txt           # Python package dependencies
├── run_app.bat                # Windows one-click launcher for Web UI
├── run_main.bat               # Windows one-click launcher for CLI runner
└── README.md                  # Comprehensive technical documentation
```

---

## 🚀 How to Run

### Method 1: Interactive Streamlit Web UI (Recommended)
Launch the web interface for real-time visual inspection, parameter tuning, alpha crossfades, and checkerboard analysis:
```bash
streamlit run app.py
```
*Or double-click `run_app.bat` on Windows.*
- Open your browser at **`http://localhost:8501`**.

### Method 2: CLI Pipeline Runner (`main.py`)
Run the registration pipeline directly from your terminal:
```bash
python main.py --pair pair_001 --transform homography --nfeatures 15000
```
*Or double-click `run_main.bat` on Windows.*

#### Command-Line Arguments:
| Argument | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--pair` | string | `pair_001` | Data pair folder under `data/pairs/` |
| `--transform` | string | `homography` | Geometric model (`homography` or `affine`) |
| `--nfeatures` | integer | `15000` | Max SIFT keypoints to extract |

---

## 📊 Evaluation Metrics & Telemetry

| Metric | Scientific Interpretation |
| :--- | :--- |
| **Inliers / Good Matches** | Number of geometrically consistent keypoints after RANSAC filtering. |
| **Inlier Ratio (%)** | Proportion of geometrically valid tie-points ($N_{\text{inliers}} / N_{\text{matches}}$). |
| **Mean Reprojection Error (px)** | Mean Euclidean distance $\frac{1}{N} \sum \|\mathbf{H} p_s - p_r\|_2$. Values $< 1.0\text{ px}$ represent sub-pixel geometric precision. |
| **Spatial Coverage (%)** | Percentage of $8 \times 8$ grid cells containing verified inliers across the lunar scene. |
| **Sub-Pixel Shift (px)** | Mean displacement applied by Lucas-Kanade gradient optimization. |

---

## 📦 Dependencies

Install all required packages via `pip`:
```bash
pip install -r requirements.txt
```

Key packages utilized:
- `opencv-python`: SIFT, FLANN, Homography, warping, image operations.
- `tifffile`: Fast GeoTIFF metadata inspection and strip seeking.
- `numpy`, `scipy`: Vectorized linear algebra and memory arrays.
- `matplotlib`: Metric plots, spatial distribution grids, and heatmaps.
- `streamlit`: High-performance interactive UI.
