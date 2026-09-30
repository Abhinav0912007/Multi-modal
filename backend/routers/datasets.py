"""
Router: /api/datasets — Query and inspect lunar mission datasets.
Supports filtering by mission, instrument, product_type, status, and free-text search.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from backend.services.dataset_service import (
    get_all_datasets,
    get_dataset_by_id,
    get_dataset_summary_stats,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("")
def list_datasets(
    q: Optional[str] = Query(None, description="Free text search query"),
    mission: Optional[str] = Query(None, description="Mission filter (Chandrayaan-1, Chandrayaan-2, all)"),
    instrument: Optional[str] = Query(None, description="Instrument filter (TMC, IIRS, OHRC, all)"),
    product_type: Optional[str] = Query(None, description="Product type code (calibrated, ortho, dtm, hyperspectral, ohrc, all)"),
    status: Optional[str] = Query(None, description="Processing status (Ready, Processing, Complete, Archived, all)"),
    year_preset: Optional[str] = Query(None, description="Year preset (ch1_era, ch2_era, all)"),
):
    """Retrieves list of filtered datasets matching criteria."""
    return get_all_datasets(
        query=q,
        mission=mission,
        instrument=instrument,
        product_type=product_type,
        status=status,
        year_preset=year_preset,
    )


@router.get("/summary")
def get_catalog_summary():
    """Returns aggregated metadata and summary statistics for the catalog."""
    return get_dataset_summary_stats()


@router.get("/{product_id}")
def get_dataset(product_id: str):
    """Retrieves comprehensive scientific metadata for a specific dataset product."""
    dataset = get_dataset_by_id(product_id)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset with ID '{product_id}' not found")
    return dataset
