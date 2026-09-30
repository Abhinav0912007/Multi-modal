"""
Module: src/pds_reader.py
Description: Robust reader for PDS3/PDS4 Chandrayaan-1 TMC images and Reference GeoTIFFs.
"""

import os
import re
import xml.etree.ElementTree as ET
import numpy as np
import tifffile
import cv2


def parse_pds4_xml(xml_path):
    """
    Parses PDS4 XML to extract image dimensions (lines, samples), offset, and data type.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    lines = None
    samples = None
    data_type_str = "UnsignedLSB2"
    offset = 0

    for elem in root.iter():
        tag = elem.tag.split("}")[-1]
        text = elem.text.strip() if elem.text else ""

        if tag == "elements":
            val = int(text)
            if lines is None:
                lines = val
            elif samples is None:
                samples = val
        elif tag == "data_type":
            data_type_str = text
        elif tag == "offset" and text.isdigit():
            offset = int(text)

    # Map PDS4 data types to NumPy dtypes
    dtype_map = {
        "UnsignedByte": np.uint8,
        "SignedByte": np.int8,
        "UnsignedLSB2": "<u2",
        "SignedLSB2": "<i2",
        "UnsignedMSB2": ">u2",
        "SignedMSB2": ">i2",
        "IEEE754LSBSingle": "<f4",
        "IEEE754MSBSingle": ">f4"
    }

    dtype = dtype_map.get(data_type_str, "<u2")
    return lines, samples, dtype, offset


def parse_pds3_lbl(lbl_path):
    """
    Parses PDS3 LBL key-value pairs to extract LINES, LINE_SAMPLES, SAMPLE_BITS, etc.
    """
    lines = None
    samples = None
    sample_bits = 16
    sample_type = "LSB_INTEGER"
    record_bytes = 0
    records = 0

    with open(lbl_path, "r", errors="ignore") as f:
        content = f.read()

    lines_match = re.search(r"LINES\s*=\s*(\d+)", content)
    samples_match = re.search(r"LINE_SAMPLES\s*=\s*(\d+)", content)
    bits_match = re.search(r"SAMPLE_BITS\s*=\s*(\d+)", content)
    type_match = re.search(r"SAMPLE_TYPE\s*=\s*([A-Za-z0-9_]+)", content)

    if lines_match:
        lines = int(lines_match.group(1))
    if samples_match:
        samples = int(samples_match.group(1))
    if bits_match:
        sample_bits = int(bits_match.group(1))
    if type_match:
        sample_type = type_match.group(1)

    if sample_bits == 8:
        dtype = np.uint8
    elif sample_bits == 16:
        dtype = "<u2" if "LSB" in sample_type or "PC" in sample_type else ">u2"
    elif sample_bits == 32:
        dtype = "<f4" if "REAL" in sample_type or "FLOAT" in sample_type else "<i4"
    else:
        dtype = "<u2"

    return lines, samples, dtype, 0


def read_pds_image(img_path, metadata_path=None, roi_lines=None, roi_samples=None):
    """
    Memory-maps and reads a raw PDS image file without memory exhaustion.
    """
    if metadata_path and metadata_path.lower().endswith(".xml"):
        lines, samples, dtype, offset = parse_pds4_xml(metadata_path)
    elif metadata_path and metadata_path.lower().endswith(".lbl"):
        lines, samples, dtype, offset = parse_pds3_lbl(metadata_path)
    else:
        # Check file size fallback
        file_size = os.path.getsize(img_path)
        samples = 4000  # Standard CH1 TMC line width
        lines = file_size // (samples * 2)
        dtype = "<u2"
        offset = 0

    print(f"[PDS Reader] Dimensions: {lines} lines x {samples} samples | Dtype: {dtype} | Offset: {offset}")

    # Memory map the binary file
    mmap = np.memmap(img_path, dtype=dtype, mode="r", offset=offset, shape=(lines, samples))

    if roi_lines is not None or roi_samples is not None:
        l0, l1 = roi_lines if roi_lines else (0, lines)
        s0, s1 = roi_samples if roi_samples else (0, samples)
        patch = np.array(mmap[l0:l1, s0:s1])
        return patch, (lines, samples, dtype)

    return mmap, (lines, samples, dtype)


def find_valid_reference_window(tif_path, target_h=4000, target_w=4000):
    """
    Scans a large reference GeoTIFF to find coordinates containing valid (non-zero) lunar terrain.
    Returns (y0, y1, x0, x1).
    """
    try:
        with tifffile.TiffFile(tif_path) as tf:
            page = tf.pages[0]
            h, w = page.shape[:2]
            
            # Try center window first
            cy, cx = h // 2, w // 2
            y0 = max(0, cy - target_h // 2)
            y1 = min(h, y0 + target_h)
            x0 = max(0, cx - target_w // 2)
            x1 = min(w, x0 + target_w)
            
            # Quick check if center has data
            try:
                patch, _ = read_reference_image(tif_path, roi=(y0, y1, x0, x1))
                if np.count_nonzero(patch > 0) > (patch.size * 0.05):
                    return y0, y1, x0, x1
            except Exception:
                pass
                
            # Scan in steps across image
            for y_step in range(0, h - target_h, max(1000, h // 10)):
                for x_step in range(0, w - target_w, max(1000, w // 10)):
                    try:
                        p, _ = read_reference_image(tif_path, roi=(y_step, y_step + target_h, x_step, x_step + target_w))
                        if np.count_nonzero(p > 0) > (p.size * 0.1):
                            print(f"[Reference Reader] Found valid terrain at [{y_step}:{y_step+target_h}, {x_step}:{x_step+target_w}]")
                            return y_step, y_step + target_h, x_step, x_step + target_w
                    except Exception:
                        continue
    except Exception as e:
        print(f"[Reference Reader] find_valid_reference_window failed: {e}")
    return 0, target_h, 0, target_w


def read_reference_image(tif_path, roi=None):
    """
    Reads a reference GeoTIFF image (supports multi-gigabyte files via fast direct strip seek or memmap).
    """
    ext = os.path.splitext(tif_path)[1].lower()

    if ext in (".tif", ".tiff"):
        # First try fast direct strip read for uncompressed TIFFs or memmap
        try:
            with tifffile.TiffFile(tif_path) as tf:
                page = tf.pages[0]
                shape = page.shape
                dtype = page.dtype
                
                if roi is not None:
                    y0, y1, x0, x1 = roi
                    y0 = max(0, min(y0, shape[0]))
                    y1 = max(y0, min(y1, shape[0]))
                    x0 = max(0, min(x0, shape[1]))
                    x1 = max(x0, min(x1, shape[1]))
                    
                    # If uncompressed and has dataoffsets, read exact rows directly in milliseconds
                    if page.compression == 1 and hasattr(page, 'dataoffsets'):
                        offsets = page.dataoffsets
                        itemsize = np.dtype(dtype).itemsize
                        row_bytes = (x1 - x0) * itemsize
                        rows = []
                        with open(tif_path, 'rb') as fh:
                            for y in range(y0, y1):
                                fh.seek(int(offsets[y]) + x0 * itemsize)
                                rows.append(np.frombuffer(fh.read(row_bytes), dtype=dtype))
                        patch = np.vstack(rows)
                        if len(patch.shape) == 3:
                            patch = patch[:, :, 0]
                        return patch, (shape, dtype)

                    # Try memmap
                    try:
                        mmap = tifffile.memmap(tif_path, mode="r")
                        patch = np.array(mmap[y0:y1, x0:x1])
                        if len(patch.shape) == 3:
                            patch = patch[:, :, 0]
                        return patch, (shape, dtype)
                    except Exception:
                        pass

                    # Fallback to direct page slicing
                    try:
                        patch = page.asarray(out='memmap')[y0:y1, x0:x1]
                    except Exception:
                        patch = page.asarray()[y0:y1, x0:x1]

                    if len(patch.shape) == 3:
                        patch = patch[:, :, 0]
                    return patch, (shape, dtype)
                else:
                    return page.asarray(), (shape, dtype)
        except Exception as err:
            print(f"[Reference Reader] Error reading TIFF: {err}")
            raise

    else:
        # Standard image (PNG, JPG, BMP)
        img = cv2.imread(tif_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise FileNotFoundError(f"Failed to read reference image at {tif_path}")
        shape = img.shape
        dtype = img.dtype
        if roi is not None:
            y0, y1, x0, x1 = roi
            img = img[y0:y1, x0:x1]
        if len(img.shape) == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return img, (shape, dtype)

