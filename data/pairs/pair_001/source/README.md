# Data Pair 001 — Source Ingestion Directory

## Data Type
Place the **unregistered / raw lunar observation** for Pair 001 here. This represents the primary target image captured by Chandrayaan (e.g. TMC, TMC-2, OHRC, or IIRS) that requires geometric coregistration and alignment.

## Expected File Formats
- PDS3 / PDS4 image raster files (`.img`, `.IMG`)
- PDS metadata labels (`.xml`, `.XML`, `.lbl`, `.LBL`, `.dub`, `.DUB`)
- Uncompressed raw archives (`.tar`, `.tar.gz`) containing calibrated data bundles
- GeoTIFF (`.tif`, `.tiff`) if pre-extracted

## Ingestion Rules
1. **DO NOT RENAME**: Original scientific filenames (e.g. `ch1_tmc_nca_20090529T0853239926_d_img_d18.img`) must NOT be renamed, truncated, or modified. Scientific timestamps and sensor channel codes are parsed by the pipeline.
2. **COPY, DO NOT MODIFY**: Always copy observation files from your archive media into this folder. Keep master archive files intact and read-only.
3. **NO PLACEHOLDERS**: Do not create empty dummy or sample files. Leave empty until authentic mission data is ingested.
