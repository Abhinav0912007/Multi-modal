"""Database engine and session management for Chandracrawl metadata persistence.

Supports production PostgreSQL with automatic fallback to SQLite for local development.
All configuration is loaded via environment variables without hardcoded secrets.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.utils.logger import get_logger

logger = get_logger("db.database")

Base = declarative_base()


def get_database_url() -> str:
    """Builds database connection URL from environment variables."""
    # 1. Direct DATABASE_URL (Heroku/Render/AWS RDS style)
    env_db_url = os.getenv("DATABASE_URL")
    if env_db_url:
        # Standardize postgres:// to postgresql:// for SQLAlchemy 2.0
        if env_db_url.startswith("postgres://"):
            env_db_url = env_db_url.replace("postgres://", "postgresql://", 1)
        return env_db_url

    # 2. Individual connection parameters
    pg_user = os.getenv("POSTGRES_USER")
    pg_pass = os.getenv("POSTGRES_PASSWORD")
    pg_host = os.getenv("POSTGRES_HOST", "localhost")
    pg_port = os.getenv("POSTGRES_PORT", "5432")
    pg_db = os.getenv("POSTGRES_DB", "chandracrawl")

    if pg_user and pg_pass:
        return f"postgresql://{pg_user}:{pg_pass}@{pg_host}:{pg_port}/{pg_db}"

    # 3. Default zero-friction fallback: Local SQLite database in data directory
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data")
    os.makedirs(data_dir, exist_ok=True)
    db_file = os.path.abspath(os.path.join(data_dir, "chandracrawl.db"))
    return f"sqlite:///{db_file}"


DATABASE_URL = get_database_url()

# Configure engine with connection pooling and dialect-specific options
try:
    if DATABASE_URL.startswith("sqlite"):
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            echo=False
        )
        logger.info(f"Initialized SQLite database at {DATABASE_URL}")
    else:
        engine = create_engine(
            DATABASE_URL,
            pool_size=10,
            max_overflow=20,
            pool_recycle=300,
            pool_pre_ping=True,
            echo=False
        )
        logger.info(f"Connected to PostgreSQL database at {DATABASE_URL.split('@')[-1]}")
except Exception as e:
    logger.warning(f"Could not connect to PostgreSQL ({e}), falling back to SQLite")
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data")
    os.makedirs(data_dir, exist_ok=True)
    db_file = os.path.abspath(os.path.join(data_dir, "chandracrawl.db"))
    DATABASE_URL = f"sqlite:///{db_file}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI Dependency for database session injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
