"""Database initialization and seeding script for Chandracrawl metadata persistence."""

import json
from datetime import datetime
from backend.db.database import engine, SessionLocal, Base
from backend.models.db_models import Dataset, DatasetAsset, ImagePair
from backend.services.dataset_service import LUNAR_DATASET_CATALOG
from backend.services.pair_discovery import discover_pairs
from backend.utils.logger import get_logger

logger = get_logger("db.init_db")


def init_db():
    """Initializes tables and seeds initial mission catalog if empty."""
    # 1. Create all tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database schema verified & synchronized.")

    session = SessionLocal()
    try:
        # 2. Seed Datasets if empty
        if session.query(Dataset).count() == 0:
            logger.info("Seeding initial lunar dataset catalog...")
            for d in LUNAR_DATASET_CATALOG:
                db_d = Dataset(
                    product_id=d["product_id"],
                    title=d["title"],
                    mission=d["mission"],
                    instrument=d["instrument"],
                    instrument_code=d.get("instrument_code", "TMC"),
                    product_type=d.get("product_type", "Calibrated Product"),
                    acquisition_time=d.get("acquisition_time"),
                    dimensions=d.get("dimensions"),
                    resolution=d.get("resolution"),
                    format=d.get("format", "GeoTIFF"),
                    processing_status=d.get("processing_status", "Ready"),
                    footprint_json=json.dumps(d.get("footprint", {})),
                    metadata_json=json.dumps(d.get("metadata", {})),
                )
                session.add(db_d)
            session.commit()
            logger.info(f"Seeded {len(LUNAR_DATASET_CATALOG)} datasets into database.")

        # 3. Seed Image Pairs if empty
        if session.query(ImagePair).count() == 0:
            logger.info("Seeding image pair registry...")
            pairs = discover_pairs()
            for p in pairs:
                pair_id = p.get("pair_id") or p.get("id")
                if not pair_id:
                    continue
                db_p = ImagePair(
                    pair_id=pair_id,
                    name=p.get("name", pair_id),
                    source_instrument=p.get("source_instrument", p.get("instrument", "TMC")),
                    reference_instrument=p.get("reference_instrument", "LROC"),
                    source_path=p.get("path"),
                    status=p.get("status", "ready"),
                    status_label=p.get("status_label", "Ready"),
                    default_roi_src=json.dumps(p.get("default_roi_src", [0, 6000, 0, 4000])),
                    default_roi_ref=json.dumps(p.get("default_roi_ref", [35000, 41000, 60000, 64000])),
                    description=p.get("description", "")
                )
                session.add(db_p)
            session.commit()
            logger.info(f"Seeded {len(pairs)} image pairs into database.")

    except Exception as e:
        session.rollback()
        logger.error(f"Error initializing/seeding database: {e}")
    finally:
        session.close()


if __name__ == "__main__":
    init_db()
