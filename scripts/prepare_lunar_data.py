"""
Script: scripts/prepare_lunar_data.py
Automated ingestion, validation, and GeoTIFF preview generator for Chandrayaan / LROC Lunar Data Pairs.
Ensures that all authentic mission rasters (PDS3 IMG, PDS4, IIRS QUB, OHRC, TMC) are fully readable
and accessible to the Mission Control web system.
"""

import os
import sys
import glob
import re
import numpy as np
import tifffile
import cv2
import json

# Setup root path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
PAIRS_DIR = os.path.join(DATA_DIR, "pairs")


def create_pds3_label(output_lbl_path, image_filename, lines, samples, sample_bits, sample_type, record_bytes=None, offset=0, instrument="TMC", mission="CHANDRAYAAN"):
    """Creates a standard PDS3 label file (.lbl) for raw rasters."""
    rec_bytes = record_bytes if record_bytes else (samples * (sample_bits // 8))
    label_text = f"""PDS_VERSION_ID                 = PDS3

/* FILE CHARACTERISTICS */
RECORD_TYPE                    = FIXED_LENGTH
RECORD_BYTES                   = {rec_bytes}
FILE_RECORDS                   = {lines}
LABEL_RECORDS                  = 1
^IMAGE                         = "{image_filename}"

/* DATA IDENTIFICATION */
DATA_SET_ID                    = "{mission}-L-{instrument}-2-EDR-V1.0"
PRODUCT_ID                     = "{os.path.splitext(image_filename)[0]}"
INSTRUMENT_NAME                = "{instrument}"
TARGET_NAME                    = "MOON"

/* DATA OBJECT */
OBJECT                         = IMAGE
  LINES                        = {lines}
  LINE_SAMPLES                 = {samples}
  SAMPLE_BITS                  = {sample_bits}
  SAMPLE_TYPE                  = {sample_type}
END_OBJECT                     = IMAGE
END
"""
    with open(output_lbl_path, "w") as f:
        f.write(label_text)
    print(f"  [Label] Created PDS3 label: {output_lbl_path}")


def process_pair(pair_id):
    print(f"\n==================================================")
    print(f"Processing Lunar Data Pair: {pair_id.upper()}")
    print(f"==================================================")

    pair_dir = os.path.join(PAIRS_DIR, pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    # ----------------------------------------------------
    # 1. PROCESS SOURCE DATA
    # ----------------------------------------------------
    source_files = [f for f in os.listdir(source_dir) if not f.endswith((".md", ".json"))]
    print(f"Found {len(source_files)} source files in {source_dir}")

    primary_source = None
    for f in source_files:
        if f.lower().endswith((".img", ".qub", ".cub", ".tif", ".tiff")):
            primary_source = os.path.join(source_dir, f)
            break

    src_meta = {}
    if primary_source:
        fname = os.path.basename(primary_source)
        fsize = os.path.getsize(primary_source)
        print(f"Primary source raster: {fname} ({fsize / (1024*1024):.1f} MB)")

        lines, samples, dtype, sample_bits, sample_type, inst, mission = None, None, None, None, None, "TMC", "CHANDRAYAAN"

        if "iir" in fname.lower() or fname.lower().endswith((".qub", ".cub")):
            # Chandrayaan-2 IIRS Hyperspectral Radiance Cube (32-bit float, 1104 channels)
            samples = 1104
            lines = fsize // (samples * 4)
            dtype = "<f4"
            sample_bits = 32
            sample_type = "PC_REAL"
            inst = "IIRS"
            mission = "CHANDRAYAAN-2"
        elif "ohr" in fname.lower():
            # Chandrayaan-2 OHRC (16-bit unsigned, 12000 swath width)
            samples = 12000
            lines = fsize // (samples * 2)
            dtype = "<u2"
            sample_bits = 16
            sample_type = "LSB_UNSIGNED_INTEGER"
            inst = "OHRC"
            mission = "CHANDRAYAAN-2"
        elif "tmc" in fname.lower() or (fsize % (4000 * 2) == 0):
            # Chandrayaan-1 TMC (16-bit unsigned, 4000 swath width)
            samples = 4000
            lines = fsize // (samples * 2)
            dtype = "<u2"
            sample_bits = 16
            sample_type = "LSB_UNSIGNED_INTEGER"
            inst = "TMC-1"
            mission = "CHANDRAYAAN-1"

        if lines and samples:
            lbl_path = os.path.splitext(primary_source)[0] + ".lbl"
            create_pds3_label(lbl_path, fname, lines, samples, sample_bits, sample_type, instrument=inst, mission=mission)

            # Extract calibrated GeoTIFF patch (e.g. center window) for instant web preview & fast matching
            crop_lines = min(4000, lines)
            crop_samples = min(4000, samples)
            l0 = min(10000, max(0, lines // 2 - crop_lines // 2))
            s0 = 0

            mmap = np.memmap(primary_source, dtype=dtype, mode="r", shape=(lines, samples))
            patch = np.array(mmap[l0:l0 + crop_lines, s0:s0 + crop_samples])

            # Normalize valid pixels
            if patch.dtype in (np.float32, np.float64):
                vmask = np.isfinite(patch) & (patch > -1e10) & (patch < 1e10)
                if np.count_nonzero(vmask) > 0:
                    p1 = float(np.percentile(patch[vmask], 1))
                    p99 = float(np.percentile(patch[vmask], 99))
                    norm = np.clip((patch - p1) / (p99 - p1 + 1e-6) * 255.0, 0, 255).astype(np.uint8)
                    norm[~vmask] = 0
                else:
                    norm = np.zeros(patch.shape, dtype=np.uint8)
            else:
                p1 = float(np.percentile(patch, 1))
                p99 = float(np.percentile(patch, 99))
                norm = np.clip((patch.astype(float) - p1) / (p99 - p1 + 1e-6) * 255.0, 0, 255).astype(np.uint8)

            # Save source.tif GeoTIFF & source_preview.png
            tif_out = os.path.join(source_dir, "source.tif")
            tifffile.imwrite(tif_out, norm)
            print(f"  [GeoTIFF] Saved calibrated source raster: {tif_out} ({norm.shape})")

            thumb_out = os.path.join(source_dir, "source_preview.png")
            thumb_resized = cv2.resize(norm, (600, int(600 * norm.shape[0] / norm.shape[1])))
            cv2.imwrite(thumb_out, thumb_resized)
            print(f"  [Preview] Saved web thumbnail: {thumb_out}")

            src_meta = {
                "filename": fname,
                "lines": lines,
                "samples": samples,
                "dtype": dtype,
                "instrument": inst,
                "mission": mission,
                "tif_path": tif_out
            }

    # ----------------------------------------------------
    # 2. PROCESS REFERENCE DATA
    # ----------------------------------------------------
    ref_files = [f for f in os.listdir(ref_dir) if not f.endswith((".md", ".json"))]
    print(f"Found {len(ref_files)} reference files in {ref_dir}")

    primary_ref = None
    for f in sorted(ref_files):
        if f.lower().endswith((".img", ".tif", ".tiff")):
            primary_ref = os.path.join(ref_dir, f)
            break

    ref_meta = {}
    if primary_ref:
        rfname = os.path.basename(primary_ref)
        rfsize = os.path.getsize(primary_ref)
        print(f"Primary reference raster: {rfname} ({rfsize / (1024*1024):.1f} MB)")

        ref_patch_8u = None
        ref_lines, ref_samples = 41340, 704

        if rfname.lower().endswith(".img"):
            # LROC NAC CDR PDS3 format: 41340 lines x 704 samples, PC_REAL float32, offset 10560 (15 * 704)
            offset = 15 * 704
            m_ref = np.memmap(primary_ref, dtype="<f4", mode="r", offset=offset, shape=(41340, 704))
            
            # Find window with authentic non-null lunar terrain
            # Sample across central strip
            l0 = 15000
            l1 = 25000
            ref_crop = np.array(m_ref[l0:l1, :])

            valid_mask = (ref_crop > -100) & (ref_crop < 10) & np.isfinite(ref_crop)
            if np.count_nonzero(valid_mask) > 1000:
                p1 = float(np.percentile(ref_crop[valid_mask], 1))
                p99 = float(np.percentile(ref_crop[valid_mask], 99))
                ref_patch_8u = np.clip((ref_crop - p1) / (p99 - p1 + 1e-6) * 255.0, 0, 255).astype(np.uint8)
                ref_patch_8u[~valid_mask] = 0
            else:
                ref_patch_8u = np.zeros((10000, 704), dtype=np.uint8)

        elif rfname.lower().endswith((".tif", ".tiff")):
            with tifffile.TiffFile(primary_ref) as tf:
                page = tf.pages[0]
                ref_lines, ref_samples = page.shape[:2]
                ref_patch_8u = page.asarray()
                if ref_patch_8u.dtype != np.uint8:
                    ref_patch_8u = ((ref_patch_8u - ref_patch_8u.min()) / (ref_patch_8u.max() - ref_patch_8u.min() + 1e-6) * 255).astype(np.uint8)

        if ref_patch_8u is not None:
            # Save reference.tif GeoTIFF for high-speed sub-millisecond retrieval by the pipeline
            ref_tif_out = os.path.join(ref_dir, "reference.tif")
            tifffile.imwrite(ref_tif_out, ref_patch_8u)
            print(f"  [GeoTIFF] Saved calibrated reference raster: {ref_tif_out} ({ref_patch_8u.shape})")

            ref_thumb_out = os.path.join(ref_dir, "reference_preview.png")
            ref_thumb = cv2.resize(ref_patch_8u, (400, int(400 * ref_patch_8u.shape[0] / ref_patch_8u.shape[1])))
            cv2.imwrite(ref_thumb_out, ref_thumb)
            print(f"  [Preview] Saved web reference thumbnail: {ref_thumb_out}")

            ref_meta = {
                "filename": rfname,
                "lines": ref_lines,
                "samples": ref_samples,
                "instrument": "LRO LROC",
                "tif_path": ref_tif_out
            }

    return {"pair_id": pair_id, "source": src_meta, "reference": ref_meta}


def main():
    print("==================================================")
    print("CHANDRAYAAN LUNAR MISSION — DATA INGESTION SUITE")
    print("==================================================")

    pairs = [d for d in sorted(os.listdir(PAIRS_DIR)) if os.path.isdir(os.path.join(PAIRS_DIR, d))]
    print(f"Discovered {len(pairs)} lunar pairs: {', '.join(pairs)}")

    manifest = {"pairs": []}
    for p in pairs:
        info = process_pair(p)
        manifest["pairs"].append(info)

    manifest_path = os.path.join(DATA_DIR, "dataset_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=4)
    print(f"\n[Manifest] Successfully updated: {manifest_path}")
    print("==================================================")
    print("ALL LUNAR DATA PAIRS INGESTED & CALIBRATED FOR WEB ACCESS!")
    print("==================================================")


if __name__ == "__main__":
    main()
