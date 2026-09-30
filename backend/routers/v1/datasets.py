"""Router: /api/v1/datasets — Dataset catalog, metadata, and pair discovery."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.schemas.datasets import DatasetItem, DatasetMetadata, PairSummary, PairDetail
from backend.services.dataset_service import dataset_service
from backend.services.pair_discovery import discover_pairs, get_pair_paths

router = APIRouter(prefix="/datasets", tags=["v1-datasets"])


@router.get("", response_model=List[Dict[str, Any]])
def list_datasets(
    query: Optional[str] = Query(None, description="Search term across mission, title, instrument"),
    mission: Optional[str] = Query(None, description="Chandrayaan-1 or Chandrayaan-2"),
    instrument: Optional[str] = Query(None, description="TMC, IIRS, OHRC, Mini-SAR, etc."),
    product_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    year_preset: Optional[str] = Query(None),
):
    """Search and filter the mission lunar dataset catalog."""
    return dataset_service.search_datasets(
        query=query,
        mission=mission,
        instrument=instrument,
        product_type=product_type,
        status=status,
        year_preset=year_preset,
    )


@router.get("/stats")
def get_dataset_stats():
    """Aggregated catalog metrics (missions, instruments, product counts)."""
    return dataset_service.get_dataset_summary_stats()


@router.get("/pairs", response_model=List[Dict[str, Any]])
def list_dataset_pairs():
    """Lists all available registration pairs in data/pairs/."""
    return discover_pairs()


@router.get("/pairs/{pair_id}")
def get_pair_detail(pair_id: str):
    """Retrieves pair metadata, source/reference paths, and default ROIs."""
    pairs = discover_pairs()
    matched = next((p for p in pairs if p["pair_id"] == pair_id), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"Pair '{pair_id}' not found")
    return matched


@router.get("/{product_id}")
def get_dataset_details(product_id: str):
    """Fetches details for a specific lunar dataset."""
    item = dataset_service.get_dataset_by_id(product_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Dataset '{product_id}' not found")
    return item


@router.get("/{product_id}/metadata")
def get_dataset_metadata(product_id: str):
    """Returns technical metadata (orbit, camera angles, radiometric level) for a dataset."""
    item = dataset_service.get_dataset_by_id(product_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Dataset '{product_id}' not found")
    return item.get("metadata", {})
