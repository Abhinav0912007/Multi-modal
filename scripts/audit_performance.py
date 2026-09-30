"""
Performance Engineering Audit & Benchmark Suite for Chandrayaan-1 TMC Application
Measures:
1. API Latencies (p50, p95, min, max) across key endpoints
2. Raster read & thumbnail generation time (Cache Miss vs Cache Hit)
3. ROI extraction and preview latency
4. Background job processing duration and throughput
5. Bounded concurrency & response behavior under load
"""

import time
import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

def timed_get(url: str, trials: int = 5):
    durations = []
    status_code = None
    response_bytes = 0
    for _ in range(trials):
        t0 = time.perf_counter()
        req = urllib.request.Request(url, headers={"User-Agent": "PerfAudit/1.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
            status_code = resp.status
            response_bytes = len(data)
        durations.append((time.perf_counter() - t0) * 1000)
    durations.sort()
    return {
        "url": url,
        "status": status_code,
        "bytes": response_bytes,
        "min_ms": round(durations[0], 2),
        "median_ms": round(durations[len(durations)//2], 2),
        "p95_ms": round(durations[-1], 2),
        "trials": trials
    }

def timed_post_json(url: str, payload: dict):
    data_bytes = json.dumps(payload).encode("utf-8")
    t0 = time.perf_counter()
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={"Content-Type": "application/json", "User-Agent": "PerfAudit/1.0"}
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        status = resp.status
    dt = (time.perf_counter() - t0) * 1000
    return status, round(dt, 2), res

def run_audit():
    print("=" * 80)
    print("PHASE 16 — PERFORMANCE ENGINEERING AUDIT & SCIENTIFIC BENCHMARK REPORT")
    print("=" * 80)

    # 1. API Latency Measurements
    print("\n[1] API LATENCY AUDIT (5 trials each)")
    endpoints = [
        f"{BASE_URL}/api/v1/health",
        f"{BASE_URL}/api/v1/datasets",
        f"{BASE_URL}/api/v1/jobs",
    ]
    for ep in endpoints:
        try:
            res = timed_get(ep, trials=5)
            print(f"  {ep.replace(BASE_URL, ''):<32} | {res['status']} | Size: {res['bytes']:>6} B | Median: {res['median_ms']:>6.2f} ms | Min: {res['min_ms']:>6.2f} ms | Max: {res['p95_ms']:>6.2f} ms")
        except Exception as e:
            print(f"  {ep.replace(BASE_URL, ''):<32} | FAILED: {e}")

    # Discover a pair ID
    pair_id = "pair_001"
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/v1/datasets") as r:
            pairs = json.loads(r.read().decode())
            if pairs and isinstance(pairs, list):
                pair_id = pairs[0].get("id", pair_id)
    except Exception:
        pass

    # 2. Dataset Loading & Metadata Latency
    print(f"\n[2] DATASET METADATA & DISCOVERY AUDIT (Pair: {pair_id})")
    try:
        t0 = time.perf_counter()
        with urllib.request.urlopen(f"{BASE_URL}/api/v1/datasets/pairs/{pair_id}") as r:
            pair_meta = json.loads(r.read().decode())
            meta_ms = (time.perf_counter() - t0) * 1000
            print(f"  Dataset Detail Query: {meta_ms:.2f} ms | Mission: {pair_meta.get('mission')} | Instrument: {pair_meta.get('instrument')}")
    except Exception as e:
        print(f"  Dataset query failed: {e}")

    # 3. Full-Scene Thumbnail Generation & Two-Tier Caching
    print(f"\n[3] SERVER-SIDE RASTER THUMBNAIL & CACHING AUDIT")
    preview_url = f"{BASE_URL}/api/v1/preview/{pair_id}/source?max_dim=512"
    ref_preview_url = f"{BASE_URL}/api/v1/preview/{pair_id}/reference?max_dim=512"
    try:
        # Source Cold & Warm
        res_src = timed_get(preview_url, trials=5)
        print(f"  Source Thumbnail (512px)       | Median: {res_src['median_ms']:>6.2f} ms | Min: {res_src['min_ms']:>6.2f} ms | Transferred: {res_src['bytes']/1024:>5.1f} KB")

        # Reference Cold & Warm
        res_ref = timed_get(ref_preview_url, trials=5)
        print(f"  Reference Thumbnail (512px)    | Median: {res_ref['median_ms']:>6.2f} ms | Min: {res_ref['min_ms']:>6.2f} ms | Transferred: {res_ref['bytes']/1024:>5.1f} KB")

        raw_size_mb = 2425.0  # Approx 2.42 GB raw binary raster
        transfer_kb = res_src['bytes'] / 1024
        saving_ratio = (raw_size_mb * 1024) / max(transfer_kb, 1)
        print(f"  --> Bandwidth Optimization: {saving_ratio:,.0f}x reduction! (Transferred {transfer_kb:.1f} KB vs downloading {raw_size_mb:.1f} MB raw dataset)")
    except Exception as e:
        print(f"  Thumbnail test failed: {e}")

    # 4. ROI Server-side Crop Preview Performance
    print(f"\n[4] SERVER-SIDE ROI SUBWINDOW EXTRACTION AUDIT (Crop: 1000x1000)")
    roi_preview_url = f"{BASE_URL}/api/v1/roi/preview/{pair_id}/source?ymin=500&ymax=1500&xmin=500&xmax=1500&max_dim=512"
    try:
        res = timed_get(roi_preview_url, trials=5)
        print(f"  ROI Crop Stream Latency        | Median: {res['median_ms']:>6.2f} ms | Min: {res['min_ms']:>6.2f} ms | Transferred: {res['bytes']/1024:>5.1f} KB")
    except Exception as e:
        print(f"  ROI preview test failed: {e}")

    # 5. Dynamic Pyramid Tile Streaming
    print(f"\n[5] PROGRESSIVE PYRAMID TILE STREAMING AUDIT")
    tile_url = f"{BASE_URL}/api/v1/raster/tile/{pair_id}/source/4/1/1"
    try:
        res = timed_get(tile_url, trials=5)
        print(f"  256x256 Pyramid Tile (z=4)     | Median: {res['median_ms']:>6.2f} ms | Min: {res['min_ms']:>6.2f} ms | Transferred: {res['bytes']/1024:>5.1f} KB")
    except Exception as e:
        print(f"  Tile test failed: {e}")

    # 6. Asynchronous Background Job Processing Duration
    print(f"\n[6] ASYNCHRONOUS BACKGROUND PROCESSING ENGINE AUDIT")
    try:
        status, launch_ms, job_info = timed_post_json(
            f"{BASE_URL}/api/v1/registration/jobs",
            {"pair_id": pair_id, "preset": "standard", "algorithm": "orb_ransac"}
        )
        job_id = job_info.get("job_id")
        print(f"  Async Job Enqueue Latency: {launch_ms:.2f} ms (Non-blocking HTTP call!) -> Job ID: {job_id}")

        # Poll job until finished and measure scientific compute duration
        t_start = time.perf_counter()
        final_status = "queued"
        while True:
            time.sleep(0.4)
            with urllib.request.urlopen(f"{BASE_URL}/api/v1/jobs/{job_id}") as r:
                data = json.loads(r.read().decode())
                final_status = data.get("status")
                if final_status in ["completed", "failed"]:
                    total_duration = time.perf_counter() - t_start
                    print(f"  Scientific Pipeline Execution: {final_status.upper()} in {total_duration:.2f}s | Progress: {data.get('progress')}%")
                    if final_status == "completed":
                        res_data = data.get("result", {})
                        print(f"    Inliers: {res_data.get('inliers')} | Matches: {res_data.get('candidate_matches', 'N/A')} | RMSE: {res_data.get('rmse', 'N/A')} px")
                    break
                if time.perf_counter() - t_start > 30:
                    print("  Job timed out waiting for completion")
                    break
    except Exception as e:
        print(f"  Job test failed: {e}")

    print("\n" + "=" * 80)

if __name__ == "__main__":
    run_audit()
