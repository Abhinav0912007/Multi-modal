"""
Module: src/tar_extractor.py
Description: Safe, automated inspection and extraction of Lunar PDS .tar bundles.
"""

import os
import tarfile
import zipfile
import io
import shutil
import glob


def discover_tar_file(source_dir):
    """
    Finds any .tar, .tar.gz, .tgz file in the source directory.
    """
    for ext in ("*.tar", "*.tar.gz", "*.tgz"):
        matches = glob.glob(os.path.join(source_dir, ext))
        if matches:
            return matches[0]
    return None


def extract_tar_bundle(tar_path, output_dir):
    """
    Safely extracts a .tar archive and handles any nested .zip files within.
    """
    os.makedirs(output_dir, exist_ok=True)
    print(f"[TAR Extractor] Opening archive: {tar_path}")

    with tarfile.open(tar_path, "r:*") as tar:
        for member in tar.getmembers():
            print(f"[TAR Extractor] Extracting member: {member.name}")
            if member.name.lower().endswith(".zip"):
                f = tar.extractfile(member)
                if f is not None:
                    with zipfile.ZipFile(io.BytesIO(f.read())) as z:
                        z.extractall(output_dir)
            else:
                tar.extract(member, output_dir)

    print(f"[TAR Extractor] Finished extraction to: {output_dir}")
    return output_dir


def scan_for_pds_data(extracted_dir):
    """
    Recursively scans the extracted folder to find the actual science image
    and associated metadata/label files (.xml, .lbl).
    Returns (image_path, metadata_path, format_type).
    """
    image_candidates = []
    metadata_candidates = []

    for root, _, files in os.walk(extracted_dir):
        for f in files:
            full_p = os.path.join(root, f)
            lower = f.lower()

            # Identify candidate images
            if lower.endswith((".img", ".tif", ".tiff", ".jp2", ".png", ".jpg")):
                # Prioritize calibrated/derived science data over small browse thumbnails
                is_browse = "browse" in full_p.lower() or "brw" in lower
                image_candidates.append((full_p, is_browse))

            # Identify candidate metadata / labels
            elif lower.endswith((".xml", ".lbl", ".pvl", ".hdr")):
                is_browse = "browse" in full_p.lower() or "brw" in lower
                metadata_candidates.append((full_p, is_browse))

    # Pick the primary science image (non-browse preferred)
    primary_images = [p for p, is_brw in image_candidates if not is_brw]
    if not primary_images and image_candidates:
        primary_images = [p for p, _ in image_candidates]

    if not primary_images:
        raise FileNotFoundError(f"No valid image files found in {extracted_dir}")

    # Prioritize .img or .tif
    selected_img = sorted(primary_images, key=lambda x: (0 if x.endswith(".img") else 1, -os.path.getsize(x)))[0]

    # Find matching metadata file with same base name or in same directory
    img_basename = os.path.splitext(os.path.basename(selected_img))[0]
    matched_meta = None
    for meta, _ in metadata_candidates:
        meta_basename = os.path.splitext(os.path.basename(meta))[0]
        if meta_basename == img_basename:
            matched_meta = meta
            break

    if not matched_meta and metadata_candidates:
        # Fall back to any metadata in the same subfolder
        img_dir = os.path.dirname(selected_img)
        for meta, _ in metadata_candidates:
            if os.path.dirname(meta) == img_dir:
                matched_meta = meta
                break

    print(f"[TAR Extractor] Discovered Source Image:    {selected_img}")
    print(f"[TAR Extractor] Discovered Source Metadata: {matched_meta}")

    return selected_img, matched_meta
