"""
Chandrayaan-1 TMC Lunar Image Registration System — FastAPI Backend
"""

import matplotlib
matplotlib.use("Agg")  # Thread-safe non-interactive backend for matplotlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import CORS_ORIGINS
from backend.routers import pairs, artifacts, terrain, pipeline, preview, datasets, features, spatial, alignment, transformation
from backend.routers.v1 import api_v1_router

app = FastAPI(
    title="Chandrayaan-1 TMC Registration API",
    description="Backend API for the Lunar Image Registration System with /api/v1 versioning and job-based asynchronous processing",
    version="2.1.0",
)

# CORS
is_wildcard = "*" in CORS_ORIGINS or len(CORS_ORIGINS) == 0

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_wildcard else CORS_ORIGINS,
    allow_credentials=False if is_wildcard else True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"https://.*\.vercel\.app" if not is_wildcard else None,
)

# 1. Mount API Version 1 Router (/api/v1/...)
app.include_router(api_v1_router)

# 2. Mount Legacy Routers for Frontend Backward Compatibility (/api/...)
app.include_router(pairs.router)
app.include_router(datasets.router)
app.include_router(artifacts.router)
app.include_router(terrain.router)
app.include_router(pipeline.router)
app.include_router(preview.router)
app.include_router(features.router)
app.include_router(spatial.router)
app.include_router(alignment.router)
app.include_router(transformation.router)


@app.get("/api/health")
@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "service": "chandracrawl-backend",
        "version": "2.1.0",
        "api_v1": "/api/v1"
    }

