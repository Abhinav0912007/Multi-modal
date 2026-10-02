"""
Pair discovery service: scans data directory for available lunar data pairs.
Reports available pairs, source files, reference files, missing files,
file extensions, file sizes, dynamic instrument metadata, and validation status.
"""

import os
import json
import re
from backend.config import PAIRS_DIR, DATA_DIR


def _load_manifest_data() -> dict:
    """Loads canonical dataset manifest if present."""
    manifest_path = os.path.join(DATA_DIR, "dataset_manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                pairs_list = data.get("pairs", [])
                return {p["id"]: p for p in pairs_list if "id" in p}
        except Exception as e:
            print(f"[PairDiscovery] Warning loading manifest: {e}")
    return {}


def _scan_folder_files(folder: str) -> list[dict]:
    """Scans a directory recursively for scientific data files, ignoring docs & hidden files."""
    files_info = []
    if not os.path.exists(folder):
        return files_info

    for root, _, filenames in os.walk(folder):
        for fname in sorted(filenames):
            # Ignore documentation, hidden, and system metadata files
            if fname.startswith(".") or fname.lower() in ("readme.md", "thumbs.db", ".ds_store"):
                continue
            full_path = os.path.join(root, fname)
            try:
                size_bytes = os.path.getsize(full_path)
            except OSError:
                size_bytes = 0

            _, ext = os.path.splitext(fname)
            # handle double extensions like .tar.gz
            if fname.lower().endswith(".tar.gz"):
                ext = ".tar.gz"

            rel_path = os.path.relpath(full_path, folder).replace("\\", "/")
            files_info.append({
                "name": fname,
                "relative_path": rel_path,
                "extension": ext.lower(),
                "size_bytes": size_bytes,
            })
    return files_info


def inspect_pair(pair_path: str, pair_id: str) -> dict:
    """Inspects a single pair directory and returns structured file and status report."""
    source_dir = os.path.join(pair_path, "source")
    ref_dir = os.path.join(pair_path, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_path, "refrence")

    source_files_info = _scan_folder_files(source_dir)
    reference_files_info = _scan_folder_files(ref_dir)

    source_names = [f["name"] for f in source_files_info]
    reference_names = [f["name"] for f in reference_files_info]

    all_extensions = sorted(list(set(
        [f["extension"] for f in source_files_info + reference_files_info if f["extension"]]
    )))

    file_sizes = {f["name"]: f["size_bytes"] for f in (source_files_info + reference_files_info)}
    total_source_size = sum(f["size_bytes"] for f in source_files_info)
    total_reference_size = sum(f["size_bytes"] for f in reference_files_info)

    # Load canonical manifest data
    manifest_map = _load_manifest_data()
    manifest_entry = manifest_map.get(pair_id, {})

    # Determine primary source file (prefer raw .img, .qub over .tif / .png)
    def _source_rank(fname: str):
        l = fname.lower()
        if l.endswith(".img") and not l.startswith("source"): return 0
        if l.endswith((".qub", ".cub")): return 1
        if l.endswith((".tif", ".tiff")): return 2
        return 3

    sorted_src = sorted(source_names, key=_source_rank)
    primary_source_name = sorted_src[0] if sorted_src else ""

    # Determine primary reference file (prefer raw .img over .tif)
    def _ref_rank(fname: str):
        l = fname.lower()
        if l.endswith(".img") and not l.startswith("reference"): return 0
        if l.endswith((".tif", ".tiff")): return 1
        return 2

    sorted_ref = sorted(reference_names, key=_ref_rank)
    primary_ref_name = sorted_ref[0] if sorted_ref else ""

    # Dynamic Instrument and Mission Detection from metadata/filename/PDS label
    mission = "Chandrayaan-2"
    instrument = "OHRC"
    instrument_name = "Chandrayaan-2 OHRC"
    product_type = "calibrated_optical_raster"
    source_dims = {"lines": 0, "samples": 0}
    status = "pending_validation"
    status_label = "Pending validation"

    is_hyperspectral = False
    band_extracted = True
    spatial_ready = True

    src_lower = primary_source_name.lower()
    if "ch2_ohr" in src_lower or "ohr" in src_lower or manifest_entry.get("instrument") == "OHRC":
        mission = "Chandrayaan-2"
        instrument = "OHRC"
        instrument_name = "Chandrayaan-2 OHRC"
        product_type = "calibrated_optical_raster"
        source_dims = {"lines": 50537, "samples": 12000}
        status = "pending_validation"
        status_label = "Pending validation"
    elif "ch2_iir" in src_lower or "iir" in src_lower or src_lower.endswith((".qub", ".cub")) or manifest_entry.get("instrument") == "IIRS":
        mission = "Chandrayaan-2"
        instrument = "IIRS"
        instrument_name = "Chandrayaan-2 IIRS"
        product_type = "HYPERSPECTRAL"
        source_dims = {"lines": 358973, "samples": 1104}
        status = "band_extraction_required"
        status_label = "Band extraction required"
        is_hyperspectral = True
        band_extracted = False
        spatial_ready = False
    elif "ch1_tmc" in src_lower or "tmc" in src_lower or manifest_entry.get("instrument") == "TMC":
        mission = "Chandrayaan-1"
        instrument = "TMC"
        instrument_name = "Chandrayaan-1 TMC"
        product_type = "optical_terrain_mapping"
        source_dims = {"lines": 210512, "samples": 4000}
        status = "pending_validation"
        status_label = "Pending validation"
    elif manifest_entry:
        mission = manifest_entry.get("mission", mission)
        instrument = manifest_entry.get("instrument", instrument)
        instrument_name = f"{mission} {instrument}"
        status = manifest_entry.get("status", status)
        if instrument == "IIRS" or manifest_entry.get("product_type") in ("hyperspectral_cube", "HYPERSPECTRAL"):
            product_type = "HYPERSPECTRAL"
            status = "band_extraction_required"
            status_label = "Band extraction required"
            is_hyperspectral = True
            band_extracted = False
            spatial_ready = False

    # Reference instrument and dimensions detection
    ref_instrument = "LROC WAC"
    ref_lower = primary_ref_name.lower()
    ref_dims = {"lines": 7420, "samples": 704}
    if "m1" in ref_lower or "lroc" in ref_lower or "nac" in ref_lower:
        if "nac" in ref_lower or "lc" in ref_lower or "rc" in ref_lower:
            ref_instrument = "LROC NAC"
            ref_dims = {"lines": 52224, "samples": 2532}
        else:
            ref_instrument = "LROC WAC"
            ref_dims = {"lines": 7420, "samples": 704}
    elif "wac" in ref_lower:
        ref_instrument = "LROC WAC"
        ref_dims = {"lines": 7420, "samples": 704}

    # Nominal ROI bounds tailored for scientific lunar feature extraction
    if instrument == "OHRC":
        nominal_roi = {
            "src_sample_start": 1000,
            "src_sample_end": 7000,
            "src_line_start": 42000,
            "src_line_end": 46000,
            "ref_x0": 100,
            "ref_y0": 3000,
            "ref_x1": 600,
            "ref_y1": 5000
        }
    else:
        nominal_roi = {
            "src_sample_start": 0,
            "src_sample_end": min(4000, source_dims["samples"]),
            "src_line_start": 0,
            "src_line_end": min(4000, source_dims["lines"]),
            "ref_x0": 0,
            "ref_y0": 0,
            "ref_x1": min(700, ref_dims["samples"]),
            "ref_y1": min(2000, ref_dims["lines"])
        }

    # Reference Geographic Overlap Validation State
    reference_status = "UNKNOWN"
    reference_status_label = "Reference geographic overlap: NOT YET VERIFIED"

    # Missing files diagnostics
    missing_files = []
    if not source_files_info:
        missing_files.append("source lunar observation data missing in source/")
        status = "missing_source"
        status_label = "Missing Source Data"
    if not reference_files_info:
        missing_files.append("reference lunar map / DTM data missing in reference/")
        if status != "missing_source":
            status = "missing_reference"
            status_label = "Missing Reference Data"

    return {
        "id": pair_id,
        "mission": mission,
        "instrument": instrument,
        "instrument_name": instrument_name,
        "product_type": product_type,
        "source_filename": primary_source_name,
        "reference_filename": primary_ref_name,
        "reference_instrument": ref_instrument,
        "source_dimensions": source_dims,
        "reference_dimensions": ref_dims,
        "nominal_roi": nominal_roi,
        "status": status,
        "status_label": status_label,
        "reference_status": reference_status,
        "reference_status_label": reference_status_label,
        "is_hyperspectral": is_hyperspectral,
        "band_extracted": band_extracted,
        "spatial_ready": spatial_ready,
        "band_extraction_required": not band_extracted if is_hyperspectral else False,
        "has_source": len(source_files_info) > 0,
        "has_reference": len(reference_files_info) > 0,
        "source_files": source_names,
        "reference_files": reference_names,
        "source_file_details": source_files_info,
        "reference_file_details": reference_files_info,
        "missing_files": missing_files,
        "file_extensions": all_extensions,
        "file_sizes": file_sizes,
        "total_size_bytes": total_source_size + total_reference_size,
        "path": pair_path,
        "source_dir": source_dir,
        "reference_dir": ref_dir,
        "exists": os.path.exists(pair_path),
    }


def get_available_pairs() -> list[dict]:
    """Returns list of available data pairs with file availability info and status."""
    pairs = []
    if not os.path.exists(PAIRS_DIR):
        return pairs

    for d in sorted(os.listdir(PAIRS_DIR)):
        pair_path = os.path.join(PAIRS_DIR, d)
        if not os.path.isdir(pair_path) or d.startswith("."):
            continue

        pair_report = inspect_pair(pair_path, d)
        pairs.append(pair_report)

    return pairs


def get_pair_detail(pair_id: str) -> dict:
    """Returns detailed information and file scan report for a specific pair."""
    pair_path = os.path.join(PAIRS_DIR, pair_id)
    if not os.path.exists(pair_path):
        return {
            "id": pair_id,
            "mission": "Unknown",
            "instrument": "Unknown",
            "status": "not_found",
            "status_label": "Not Found",
            "exists": False,
            "missing_files": [f"Directory {pair_path} does not exist"],
            "source_files": [],
            "reference_files": [],
            "file_extensions": [],
            "file_sizes": {},
        }

    return inspect_pair(pair_path, pair_id)


def discover_pairs() -> list[dict]:
    """Alias for get_available_pairs."""
    return get_available_pairs()


def get_pair_paths(pair_id: str) -> dict:
    """Returns primary source and reference file paths for a dataset pair."""
    pair_dir = os.path.join(PAIRS_DIR, pair_id)
    source_dir = os.path.join(pair_dir, "source")
    ref_dir = os.path.join(pair_dir, "reference")
    if not os.path.exists(ref_dir):
        ref_dir = os.path.join(pair_dir, "refrence")

    # Discover source file
    src_file = None
    if os.path.exists(source_dir):
        for f in os.listdir(source_dir):
            if f.lower().endswith((".img", ".tif", ".tiff", ".png", ".jpg", ".qub")):
                src_file = os.path.join(source_dir, f)
                break

    # Discover reference file
    ref_file = None
    if os.path.exists(ref_dir):
        for f in os.listdir(ref_dir):
            if f.lower().endswith((".tif", ".tiff", ".img", ".png", ".jpg")):
                ref_file = os.path.join(ref_dir, f)
                break

    return {
        "pair_id": pair_id,
        "source": src_file or os.path.join(source_dir, "source.tif"),
        "reference": ref_file or os.path.join(ref_dir, "reference.tif"),
        "source_dir": source_dir,
        "reference_dir": ref_dir,
    }



