"""ExportService: GeoTIFF packaging, STAC metadata, PDF audit report generation."""

import os
import zipfile
from typing import Any, Dict, List, Optional
import numpy as np

from backend.config import ARTIFACTS_DIR
from backend.services.reporting_service import build_scientific_report_data
from backend.utils.logger import get_logger

logger = get_logger("services.export")


class ExportService:
    """Manages archival exports of aligned rasters, transformation matrices, and mission reports."""

    def package_export(
        self,
        pair_id: str,
        job_id: Optional[str] = None,
        include_pdf: bool = True
    ) -> Dict[str, Any]:
        """Packages registered products into a downloadable ZIP archive."""
        pair_artifact_dir = os.path.join(ARTIFACTS_DIR, pair_id)
        os.makedirs(pair_artifact_dir, exist_ok=True)

        zip_filename = f"chandracrawl_export_{pair_id}.zip"
        zip_path = os.path.join(pair_artifact_dir, zip_filename)

        exported_files: List[str] = []
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(pair_artifact_dir):
                for f in files:
                    if f == zip_filename:
                        continue
                    full_p = os.path.join(root, f)
                    arcname = os.path.relpath(full_p, pair_artifact_dir)
                    zf.write(full_p, arcname)
                    exported_files.append(arcname)

        total_size = os.path.getsize(zip_path) if os.path.exists(zip_path) else 0

        return {
            "pair_id": pair_id,
            "export_id": zip_filename,
            "download_url": f"/api/artifacts/{pair_id}/{zip_filename}",
            "files": exported_files,
            "total_size_bytes": total_size,
        }

    def generate_pdf_report(
        self,
        pair_id: str,
        metrics: Dict[str, Any],
        matrix: Any
    ) -> str:
        """Assembles scientific mission report data and saves report summary."""
        report_data = build_scientific_report_data(pair_id=pair_id)
        pair_artifact_dir = os.path.join(ARTIFACTS_DIR, pair_id)
        os.makedirs(pair_artifact_dir, exist_ok=True)
        report_json_path = os.path.join(pair_artifact_dir, "scientific_report.json")
        with open(report_json_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, default=str)
        return report_json_path


export_service = ExportService()
