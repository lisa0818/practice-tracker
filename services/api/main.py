import httpx
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel

app = FastAPI(title="Practice Tracker Orchestrator API")

# Define worker service URLs
WORKER_MONO_URL = "http://localhost:8081/analyze"
WORKER_POLY_URL = "http://127.0.0.1:8082/analyze"

class AnalysisRequest(BaseModel):
    bucket: str
    name: str
    analysis_type: str  # "mono" or "poly"

@app.post("/api/analyze")
async def orchestrate_analysis(payload: AnalysisRequest):
    if payload.analysis_type.lower() == "poly":
        target_url = WORKER_POLY_URL
    elif payload.analysis_type.lower() == "mono":
        target_url = WORKER_MONO_URL
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid analysis type. Choose 'mono' or 'poly'."
        )

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                target_url,
                json={"bucket": payload.bucket, "name": payload.name}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Worker error: {response.text}"
                )
                
            return {
                "status": "success",
                "orchestrator_routed_to": payload.analysis_type,
                "worker_response": response.json()
            }
            
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Could not connect to {payload.analysis_type} worker: {exc}"
            )