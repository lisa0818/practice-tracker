from datetime import datetime, timedelta
import os
import requests
from typing import Optional
from fastapi import FastAPI, Depends, status, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google.cloud import storage
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.database import Base, engine, get_db
from app.models import AnalysisResult, PracticeSession, User

# Auto-create missing database tables on boot
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Music Practice Tracker - Core API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from Environment
PROJECT_ID = os.getenv("PROJECT_ID", "practice-tracker-2026-10")
UPLOADS_BUCKET = os.getenv("UPLOADS_BUCKET", f"{PROJECT_ID}-uploads")
WORKER_URL = os.getenv("WORKER_URL", "https://worker-mono-571568987946.asia-south1.run.app/analyze")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# Pydantic Request Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "student"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class SessionCreate(BaseModel):
    title: str
    target_scale: str
    filename: str  # e.g., "my_c_major.wav" or "test-song.mp3"
    mode: str = "mono"  # Accepts "mono" or "poly" to route GCS uploads dynamically


class AnalysisSubmit(BaseModel):
    overall_score: float
    avg_cents_error: float
    extracted_notes: dict
    timing_alignment: Optional[dict] = None


# Health Endpoint
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "core-api"}


# Auth Endpoints
@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    hashed_pw = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_pw,
        full_name=user_data.full_name,
        role=user_data.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": str(new_user.id),
    }


@app.post("/auth/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": str(user.id),
    }


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
    }


# Practice Sessions & Signed Upload URL Endpoints
@app.post("/sessions", status_code=status.HTTP_201_CREATED)
def create_session(
    session_data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_session = PracticeSession(
        user_id=current_user.id,
        title=session_data.title,
        target_scale=session_data.target_scale,
        status="pending",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Dynamically route to mono or poly folder based on request mode
    folder_type = "poly" if session_data.mode.lower() == "poly" else "mono"
    gcs_object_path = f"uploads/{folder_type}/{current_user.id}/{new_session.id}_{session_data.filename}"
    
    new_session.audio_gcs_path = gcs_object_path
    db.commit()

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(UPLOADS_BUCKET)
        blob = bucket.blob(gcs_object_path)

        upload_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15),
            method="PUT",
        )
    except Exception as e:
        upload_url = f"http://localhost:8000/mock-upload/{gcs_object_path}"

    return {
        "session_id": str(new_session.id),
        "mode": folder_type,
        "gcs_path": gcs_object_path,
        "upload_url": upload_url,
        "expires_in_minutes": 15,
    }


@app.get("/sessions/{session_id}")
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(PracticeSession)
        .filter(
            PracticeSession.id == session_id,
            PracticeSession.user_id == current_user.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result_data = None
    if session.result:
        result_data = {
            "overall_score": float(session.result.overall_score),
            "avg_cents_error": float(session.result.avg_cents_error),
            "extracted_notes": session.result.extracted_notes,
            "timing_alignment": session.result.timing_alignment,
        }

    return {
        "session_id": str(session.id),
        "title": session.title,
        "target_scale": session.target_scale,
        "status": session.status,
        "audio_gcs_path": session.audio_gcs_path,
        "created_at": session.created_at,
        "result": result_data,
    }


# Save Analysis Results Endpoint (Called when worker finishes processing)
@app.post("/sessions/{session_id}/analysis", status_code=status.HTTP_201_CREATED)
def save_analysis_results(
    session_id: str,
    analysis_data: AnalysisSubmit,
    db: Session = Depends(get_db),
):
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save metrics into AnalysisResult table
    analysis_result = AnalysisResult(
        session_id=session.id,
        overall_score=analysis_data.overall_score,
        avg_cents_error=analysis_data.avg_cents_error,
        extracted_notes=analysis_data.extracted_notes,
        timing_alignment=analysis_data.timing_alignment,
    )
    session.status = "completed"

    db.add(analysis_result)
    db.commit()
    db.refresh(analysis_result)

    return {"status": "success", "analysis_id": str(analysis_result.id)}


@app.get("/sessions")
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .order_by(PracticeSession.created_at.desc())
        .all()
    )
    
    return [
        {
            "session_id": str(session.id),
            "title": session.title,
            "target_scale": session.target_scale,
            "status": session.status,
            "created_at": session.created_at,
        }
        for session in sessions
    ]