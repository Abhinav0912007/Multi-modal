# Chandrayaan Lunar Image Registration System — Dataset Repository

This directory (`data/`) is the central repository for raw and calibrated planetary remote-sensing datasets used in multi-modal lunar image registration.

---

## 1. Directory Structure

```text
data/
├── dataset_manifest.json       # Formal catalog manifest indexing ingested pairs
├── README.md                   # This organization and specification guide
└── pairs/
    ├── pair_001/
    │   ├── source/             # Input unaligned Chandrayaan observation
    │   └── reference/          # Georeferenced reference base image / DTM
    ├── pair_002/
    │   ├── source/
    │   └── reference/
    └── pair_003/
        ├── source/
        └── reference/
```

---

## 2. Ingestion Principles & Rules

1. **NO Placeholder Data**: Do not place empty, synthetic, or fake `.IMG` / `.XML` / `.TIF` files in these folders.
2. **Preserve Original Scientific Filenames**:
   - Planetary data filenames (e.g. `ch1_tmc_nca_20090529T0853239926_d_img_d18.img`) encode UTC timestamp, sensor, viewing geometry, orbit number, and calibration level.
   - **Never rename**, strip, or sanitize original filenames.
3. **Read-Only / Copy Workflow**:
   - Always **copy** scientific data into `data/pairs/<pair_id>/source/` or `reference/`. Never work directly on master observation archives.
   - Do not modify binary headers or text labels.

---

## 3. Dataset Specifications by Instrument & Product

### A. Chandrayaan-2 IIRS (Imaging Infrared Spectrometer)
* **Description**: Hyperspectral lunar imaging sensor capturing 256 contiguous spectral bands (0.8 µm to 5.0 µm).
* **Placement**: Typically placed in `source/` as target unaligned/unorthorectified observation.
* **Expected Formats**:
  - PDS4 XML label (`.xml`) + Binary table/image array (`.tab`, `.dat`, `.img`, or `.raw`).
  - Radiometrically calibrated radiance/reflectance cubes.
* **Role**: In multi-modal registration, selected continuum bands (e.g. band ~1.0 µm or ~1.5 µm) are extracted to align with high-resolution optical reference images.

### B. Chandrayaan-2 OHRC (Orbiter High Resolution Camera)
* **Description**: Sub-meter spatial resolution camera (~0.25 m to 0.32 m/pixel ground resolution) capturing detailed landing site imagery and hazard maps.
* **Placement**: Placed in `source/` (for alignment against regional maps) or in `reference/` (when serving as local ultra-high-resolution truth).
* **Expected Formats**:
  - PDS4 Product label (`.xml`) + Multi-spectral/panchromatic image raster (`.img` / `.raw` / `.tif`).
  - Standard calibrated Level-1 and Level-2 products.

### C. Chandrayaan-1 / Chandrayaan-2 TMC Calibrated Products
* **Description**: Terrain Mapping Camera (TMC: 5 m resolution, Fore/Nadir/Aft stereo triplets; TMC-2: ~5 m resolution from 100 km orbit).
* **Placement**: Placed in `source/` for unaligned strips (e.g. Nadir `nca`, Fore `fca`, or Aft `aca` channels).
* **Expected Formats**:
  - PDS3 / PDS4 product: `.img` raster accompanied by `.xml` or `.lbl` label, or uncompressed `.tar` / `.tar.gz` distribution bundle directly from ISSDC.

### D. TMC DTM (Digital Terrain Model)
* **Description**: Gridded elevation surface model derived from TMC stereo triplet processing.
* **Placement**:
  - Placed in `reference/` when elevation contours or shaded relief are used to georeference imagery.
  - Or retained in `data/pairs/<pair_id>/reference/` alongside ortho-imagery for terrain-corrected parallax correction.
* **Expected Formats**:
  - 32-bit floating point GeoTIFF (`.tif`, `.tiff`) or PDS3 `.img` with elevation values in meters relative to lunar reference radius (1737.4 km).

### E. TMC Orthoproduct
* **Description**: Orthorectified, map-projected (e.g. Lunar Polar Stereographic or Equirectangular) reflectance product generated from TMC imagery.
* **Placement**: Placed in `reference/` when serving as the base cartographic map against which new strips are coregistered.
* **Expected Formats**:
  - GeoTIFF (`.tif`, `.tiff`) with embedded cartographic projection tags (CRS, pixel resolution, tie points).

### F. LROC Reference Imagery (NAC & WAC)
* **Description**: Lunar Reconnaissance Orbiter Camera Narrow Angle Camera (NAC, ~0.5 m/px) and Wide Angle Camera (WAC, ~100 m/px global mosaic).
* **Placement**: Placed in `reference/`.
* **Expected Formats**:
  - Calibrated GeoTIFF (`.tif`, `.tiff`), USGS ISIS cubes (`.cub`), or PDS3/PDS4 geocoded images (`.jp2`, `.img`).
  - Standard map projections: Polar Stereographic for latitudes $>60^\circ$, Equirectangular / Sinusoidal for equatorial regions.

---

## 4. Manifest Registration

When real datasets are copied into a pair directory, register the pair in `data/dataset_manifest.json` following the schema outlined in that file.
