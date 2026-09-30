# Data Pair 001 — Reference Ingestion Directory

## Data Type
Place the **georeferenced / orthorectified reference lunar base product** for Pair 001 here. This acts as the geometric ground truth against which the source image will be registered.

## Expected File Formats
- Map-projected GeoTIFF (`.tif`, `.tiff`) with geotransform tags
- TMC Orthoproducts (`.tif`)
- TMC DTM products (`.tif`)
- LROC NAC / WAC reference mosaics or USGS ISIS cubes (`.cub`, `.tif`, `.jp2`)
- PDS3 / PDS4 calibrated ortho-rasters with associated metadata (`.xml`, `.lbl`)

## Ingestion Rules
1. **DO NOT RENAME**: Original scientific filenames (e.g. `ch1_tmc_ndn_20090530T1441405667_d_oth_d18.tif`) must NOT be renamed, truncated, or modified.
2. **COPY, DO NOT MODIFY**: Always copy reference data from your master storage into this folder. Never edit geocoding headers or spatial references.
3. **NO PLACEHOLDERS**: Do not create empty dummy or sample files. Leave empty until authentic reference data is ingested.
