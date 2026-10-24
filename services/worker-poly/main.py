"""
Polyphonic worker — Cloud Run service triggered by Pub/Sub or Eventarc.
Analyzes audio with Basic Pitch and posts results back to the Core API.
"""

import json
import os
import base64
import numpy as np
import requests
import tempfile
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from typing import Optional, Dict, Any

from analyzer import analyze_polyphonic_audio, analyze_polyphonic_file

app = FastAPI(title="Practice Tracker — Poly Worker")

CORE_API_URL = os.getenv("CORE_API_URL", "http://core-api:8000")


def _convert_numpy(obj):
    """Recursively convert numpy types to native Python for JSON serialization."""
    if isinstance(obj, np.integer):  return int(obj)
    if isinstance(obj, np.floating): return float(obj)
    if isinstance(obj, np.ndarray):  return obj.tolist()
    if isinstance(obj, dict):  return {str(k): _convert_numpy(v) for k, v in obj.items()}
    if isinstance(obj, list):  return [_convert_numpy(i) for i in obj]
    if isinstance(obj, tuple): return [_convert_numpy(i) for i in obj]
    return obj


@app.get("/health")
def health():
    return {"status": "healthy", "worker": "poly"}


@app.post("/analyze-file")
async def analyze_file(
    request: Request,
    bpm: Optional[float] = None,
    tuning: float = 440.0,
    session_id: Optional[str] = None,
):
    """Directly analyze an uploaded polyphonic audio file from request body."""
    content = await request.body()
    suffix = ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        temp_path = tmp.name

    try:
        metrics = analyze_polyphonic_file(temp_path, bpm, tuning)
        clean   = _convert_numpy(metrics)
    except Exception as e:
        if session_id:
            try:
                requests.patch(f"{CORE_API_URL}/sessions/{session_id}/status",
                               json={"status": "failed"}, timeout=5)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Poly analysis error: {e}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    # If session_id provided, post results to Core API
    if session_id and session_id != "unknown":
        try:
            resp = requests.post(
                f"{CORE_API_URL}/sessions/{session_id}/analysis",
                json=clean,
                timeout=30,
            )
            resp.raise_for_status()
        except Exception as e:
            print(f"WARNING: Failed to post results to core API: {e}")

    return {
        "session_id": session_id or "direct",
        "status":     "success",
        "worker":     "poly",
        "metrics":    clean,
    }


@app.post("/")
@app.post("/analyze")
async def trigger_analysis(request: Request):
    """
    Accepts:
    - Pub/Sub push message (base64-encoded JSON in message.data)
    - Eventarc GCS notification (flat {bucket, name})
    - Direct webhook {bucket, name}
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Decode Pub/Sub push message
    if "message" in body:
        msg = body["message"]
        if "data" in msg:
            decoded    = base64.b64decode(msg["data"]).decode("utf-8")
            event_data = json.loads(decoded)
        else:
            event_data = msg.get("attributes", {})
    elif "data" in body:
        event_data = body["data"]
    else:
        event_data = body

    gcs_bucket = event_data.get("bucket")
    gcs_path   = event_data.get("name")

    if not gcs_bucket or not gcs_path:
        raise HTTPException(status_code=400, detail="Missing bucket or name in event payload")

    # Only process poly uploads
    if "/poly/" not in gcs_path:
        return {"status": "skipped", "reason": "not a poly upload path"}

    # Derive session_id from path: uploads/poly/{user_id}/{session_id}_{filename}
    parts      = gcs_path.split("/")
    session_id = "unknown"
    if len(parts) >= 4:
        session_id = parts[3].split("_")[0]

    # Mark session as processing
    try:
        requests.patch(
            f"{CORE_API_URL}/sessions/{session_id}/status",
            json={"status": "processing"},
            timeout=5,
        )
    except Exception:
        pass

    # Run analysis
    try:
        metrics = analyze_polyphonic_audio(gcs_bucket, gcs_path)
        clean   = _convert_numpy(metrics)
    except Exception as e:
        try:
            requests.patch(f"{CORE_API_URL}/sessions/{session_id}/status",
                           json={"status": "failed"}, timeout=5)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))

    # Post results to Core API
    if session_id != "unknown":
        try:
            resp = requests.post(
                f"{CORE_API_URL}/sessions/{session_id}/analysis",
                json=clean,
                timeout=30,
            )
            resp.raise_for_status()
        except Exception as e:
            print(f"WARNING: Failed to post results to core API: {e}")

    return {
        "session_id": session_id,
        "status":     "success",
        "worker":     "poly",
        "metrics":    clean,
    }