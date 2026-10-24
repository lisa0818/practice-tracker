from analyzer import analyze_polyphonic_audio  # Matches your analyzer.py file
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import numpy as np
from database import save_analysis_to_db

app = FastAPI(title="Music Practice Tracker - Polyphonic Audio Analysis Worker")

class WebhookPayload(BaseModel):
    bucket: Optional[str] = None
    name: Optional[str] = None
    data: Optional[Dict[str, Any]] = None  # Supports Eventarc payloads

def convert_numpy_types(obj):
    """Recursively convert numpy types to native Python types for JSON serialization."""
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {str(k): convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(i) for i in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_numpy_types(i) for i in obj)
    return obj


@app.post("/")
@app.post("/analyze")
async def trigger_analysis(payload: WebhookPayload):
    try:
        body = payload.model_dump()
        
        event_data = body.get("data") or body
        gcs_bucket = event_data.get("bucket")
        gcs_path = event_data.get("name")

        if not gcs_bucket or not gcs_path:
            raise HTTPException(status_code=400, detail="Missing bucket or name in event payload")

        # Derive session_id from gcs_path (uploads/poly/{session_id}/{filename})
        path_parts = gcs_path.split("/")
        session_id = path_parts[2] if len(path_parts) > 2 else "unknown"

        # Run polyphonic audio analysis logic
        metrics = analyze_polyphonic_audio(gcs_bucket, gcs_path)

        # Save metrics directly to PostgreSQL database
        if session_id != "unknown":
            save_analysis_to_db(session_id, metrics)

        clean_metrics = convert_numpy_types(metrics)

        return {
            "session_id": session_id,
            "status": "success",
            "worker": "poly",
            "metrics": clean_metrics,
        }
    except Exception as e:
        print(f"Error processing poly event: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {"status": "healthy", "worker": "poly"}