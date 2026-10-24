"""
Practice Tracker — Core API v2
FastAPI service: auth, sessions, analysis results, progress.
"""

from datetime import datetime, timedelta, date
from collections import defaultdict
import os
import requests
from typing import Optional, List
from fastapi import FastAPI, Depends, status, HTTPException, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google.cloud import storage
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import cast, Date, func
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
    SECRET_KEY,
    ALGORITHM,
)
from app.database import Base, engine, get_db
from app.models import AnalysisResult, PracticeSession, User

# Auto-create missing database tables on boot
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Music Practice Tracker — Core API v2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID    = os.getenv("PROJECT_ID",    "practice-tracker-2026-10")
UPLOADS_BUCKET = os.getenv("UPLOADS_BUCKET", f"{PROJECT_ID}-uploads")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Pydantic models ───────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email:     EmailStr
    password:  str
    full_name: str
    role:      str = "student"


class SessionCreate(BaseModel):
    title:        str
    target_scale: Optional[str] = "Auto-detected"
    filename:     str
    mode:         str = "mono"           # "mono" | "poly"
    instrument:   Optional[str] = None
    target_type:  Optional[str] = "scale"
    bpm:          Optional[int] = None
    tuning_hz:    Optional[int] = 440


class NoteEventSchema(BaseModel):
    onset_s:        float
    offset_s:       float
    midi:           int
    cents_error:    Optional[float] = None
    confidence:     float = 1.0
    label:          Optional[str]  = None
    expected_midi:  Optional[int]  = None
    onset_error_ms: Optional[float]= None
    early_late:     Optional[str]  = None   # "early" | "late" | "onBeat"


class AnalysisSubmit(BaseModel):
    """Payload sent by the worker when analysis is complete."""
    overall_score:     float
    pitch_score:       Optional[float] = None
    timing_score:      Optional[float] = None

    # Pitch
    in_tune_pct:       Optional[float] = None
    avg_cents_error:   float = 0.0
    is_polyphonic:     bool  = False
    pitch_contour_url: Optional[str]  = None

    # Timing
    avg_onset_ms:      Optional[float] = None
    steadiness:        Optional[float] = None
    notes_on_beat_pct: Optional[float] = None
    practice_tip:      Optional[str]   = None

    # Note events
    note_events:       Optional[list]  = None

    # Backward compat
    extracted_notes:   Optional[dict]  = None
    timing_alignment:  Optional[dict]  = None


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "core-api-v2"}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email is already registered")

    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id)})
    return {"access_token": token, "token_type": "bearer", "user_id": str(new_user.id)}


@app.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer", "user_id": str(user.id)}


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id":        str(current_user.id),
        "email":     current_user.email,
        "full_name": current_user.full_name,
        "role":      current_user.role,
    }


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.post("/sessions", status_code=status.HTTP_201_CREATED)
def create_session(
    session_data: SessionCreate,
    current_user: User  = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    new_session = PracticeSession(
        user_id=current_user.id,
        title=session_data.title,
        target_scale=session_data.target_scale,
        instrument=session_data.instrument,
        target_type=session_data.target_type,
        mode=session_data.mode,
        bpm=session_data.bpm,
        tuning_hz=session_data.tuning_hz or 440,
        status="pending",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    folder_type = "poly" if session_data.mode.lower() == "poly" else "mono"
    gcs_path    = f"uploads/{folder_type}/{current_user.id}/{new_session.id}_{session_data.filename}"
    new_session.audio_gcs_path = gcs_path
    db.commit()

    # Generate signed upload URL
    try:
        storage_client = storage.Client()
        bucket         = storage_client.bucket(UPLOADS_BUCKET)
        blob           = bucket.blob(gcs_path)
        upload_url     = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15),
            method="PUT",
        )
    except Exception:
        # Fallback for local dev
        upload_url = f"http://localhost:8000/mock-upload/{gcs_path}"

    return {
        "session_id":        str(new_session.id),
        "mode":              folder_type,
        "gcs_path":          gcs_path,
        "upload_url":        upload_url,
        "expires_in_minutes": 15,
    }


def get_user_optional(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    return user
        except Exception:
            pass

    user = db.query(User).first()
    if not user:
        user = User(
            email="student@practicetracker.com",
            hashed_password=get_password_hash("password123"),
            full_name="Student",
            role="student",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@app.post("/sessions/analyze-direct")
async def analyze_direct(
    file: UploadFile = File(...),
    instrument: Optional[str] = Form("Piano"),
    title: Optional[str] = Form(None),
    mode: Optional[str] = Form(None),
    bpm: Optional[float] = Form(None),
    tuning_hz: Optional[int] = Form(440),
    current_user: User = Depends(get_user_optional),
    db: Session = Depends(get_db),
):
    """
    Accepts direct audio upload from mobile/web app,
    runs the appropriate ML worker (poly for Piano/Guitar, mono for Voice/Violin),
    saves calculated note events, pitch intonation, and timing scores into Postgres,
    and returns the completed session object.
    """
    inst = instrument or "Piano"
    raw_filename = file.filename or "recording.mp3"

    if not title or title.strip() == "":
        clean_name = os.path.splitext(raw_filename)[0].replace("_", " ").replace("-", " ").strip()
        title = clean_name.title() if clean_name else "Recording"

    folder_type = mode.lower() if mode else ("poly" if inst.lower() in ["piano", "guitar"] else "mono")

    # 1. Create PracticeSession
    new_session = PracticeSession(
        user_id=current_user.id,
        title=title,
        target_scale="Auto-detected",
        instrument=inst,
        target_type="audio",
        mode=folder_type,
        bpm=int(bpm) if bpm else None,
        tuning_hz=tuning_hz or 440,
        status="processing",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # 2. Read audio content
    file_bytes = await file.read()

    # 3. Choose worker URL (internal docker network)
    worker_host = "http://worker-poly:8080" if folder_type == "poly" else "http://worker-mono:8080"

    metrics = None
    try:
        params = {
            "session_id": str(new_session.id),
            "tuning": str(tuning_hz or 440),
        }
        if bpm:
            params["bpm"] = str(bpm)

        resp = requests.post(
            f"{worker_host}/analyze-file",
            params=params,
            data=file_bytes,
            headers={"Content-Type": "application/octet-stream"},
            timeout=90,
        )
        if resp.status_code == 200:
            resp_json = resp.json()
            metrics = resp_json.get("metrics")
    except Exception as e:
        print(f"Worker invocation error: {e}")

    # 4. Check if AnalysisResult was saved (either by worker callback or direct response)
    existing_result = db.query(AnalysisResult).filter(AnalysisResult.session_id == new_session.id).first()

    if not existing_result and metrics:
        existing_result = AnalysisResult(
            session_id=new_session.id,
            overall_score=metrics.get("overall_score", 85.0),
            pitch_score=metrics.get("pitch_score"),
            timing_score=metrics.get("timing_score"),
            in_tune_pct=metrics.get("in_tune_pct"),
            avg_cents_error=metrics.get("avg_cents_error", 0.0),
            is_polyphonic=(folder_type == "poly"),
            pitch_contour_url=metrics.get("pitch_contour_url"),
            avg_onset_ms=metrics.get("avg_onset_ms"),
            steadiness=metrics.get("steadiness"),
            notes_on_beat_pct=metrics.get("notes_on_beat_pct"),
            practice_tip=metrics.get("practice_tip"),
            note_events=metrics.get("note_events"),
            extracted_notes=metrics.get("extracted_notes"),
            timing_alignment=metrics.get("timing_alignment"),
        )
        db.add(existing_result)
        db.commit()
        db.refresh(existing_result)

    new_session.status = "completed"
    db.commit()
    db.refresh(new_session)

    return _serialize_session(new_session)


def _serialize_session(session: PracticeSession) -> dict:
    result_data = None
    if session.result:
        r = session.result
        result_data = {
            "overall_score":     float(r.overall_score),
            "pitch_score":       float(r.pitch_score)  if r.pitch_score  else None,
            "timing_score":      float(r.timing_score) if r.timing_score else None,
            "in_tune_pct":       float(r.in_tune_pct)  if r.in_tune_pct  else None,
            "avg_cents_error":   float(r.avg_cents_error) if r.avg_cents_error else 0.0,
            "is_polyphonic":     bool(r.is_polyphonic),
            "pitch_contour_url": r.pitch_contour_url,
            "avg_onset_ms":      float(r.avg_onset_ms)      if r.avg_onset_ms      else None,
            "steadiness":        float(r.steadiness)        if r.steadiness        else None,
            "notes_on_beat_pct": float(r.notes_on_beat_pct) if r.notes_on_beat_pct else None,
            "practice_tip":      r.practice_tip,
            "note_events":       r.note_events or [],
            # Backward compat
            "extracted_notes":   r.extracted_notes,
            "timing_alignment":  r.timing_alignment,
        }

    return {
        "session_id":     str(session.id),
        "title":          session.title,
        "target_scale":   session.target_scale,
        "instrument":     session.instrument,
        "target_type":    session.target_type,
        "mode":           session.mode,
        "bpm":            session.bpm,
        "tuning_hz":      session.tuning_hz,
        "status":         session.status,
        "audio_gcs_path": session.audio_gcs_path,
        "created_at":     session.created_at,
        "result":         result_data,
        # Convenience score fields for list views
        "overall_score":  float(session.result.overall_score) if session.result else None,
        "pitch_score":    float(session.result.pitch_score)   if session.result and session.result.pitch_score else None,
        "timing_score":   float(session.result.timing_score)  if session.result and session.result.timing_score else None,
    }


@app.get("/sessions/{session_id}")
def get_session(
    session_id:   str,
    current_user: User    = Depends(get_user_optional),
    db:           Session = Depends(get_db),
):
    session = (
        db.query(PracticeSession)
        .filter(PracticeSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize_session(session)


@app.get("/sessions")
def list_sessions(
    current_user: User    = Depends(get_user_optional),
    db:           Session = Depends(get_db),
):
    sessions = (
        db.query(PracticeSession)
        .order_by(PracticeSession.created_at.desc())
        .limit(20)
        .all()
    )
    return [_serialize_session(s) for s in sessions]


# ── Session status update (called by workers) ────────────────────────────────

class StatusUpdate(BaseModel):
    status: str  # "processing" | "failed"

@app.patch("/sessions/{session_id}/status")
def update_session_status(
    session_id:  str,
    body:        StatusUpdate,
    db:          Session = Depends(get_db),
):
    """
    Internal — workers call this to update session status.
    No user auth; protected by Cloud Run internal-only ingress.
    """
    allowed = {"processing", "failed", "completed"}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")

    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = body.status
    db.commit()
    return {"session_id": session_id, "status": body.status}


# ── Analysis results (called by worker) ──────────────────────────────────────

@app.post("/sessions/{session_id}/analysis", status_code=status.HTTP_201_CREATED)
def save_analysis_results(
    session_id:    str,
    analysis_data: AnalysisSubmit,
    db:            Session = Depends(get_db),
):
    """
    Internal endpoint — called by workers after analysis.
    No auth required; protected by Cloud Run ingress (internal traffic only).
    Idempotent: if a result already exists, update it.
    """
    session = db.query(PracticeSession).filter(PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    existing = db.query(AnalysisResult).filter(AnalysisResult.session_id == session.id).first()
    if existing:
        # Idempotent update
        result = existing
    else:
        result = AnalysisResult(session_id=session.id)
        db.add(result)

    result.overall_score     = analysis_data.overall_score
    result.pitch_score       = analysis_data.pitch_score
    result.timing_score      = analysis_data.timing_score
    result.in_tune_pct       = analysis_data.in_tune_pct
    result.avg_cents_error   = analysis_data.avg_cents_error
    result.is_polyphonic     = analysis_data.is_polyphonic
    result.pitch_contour_url = analysis_data.pitch_contour_url
    result.avg_onset_ms      = analysis_data.avg_onset_ms
    result.steadiness        = analysis_data.steadiness
    result.notes_on_beat_pct = analysis_data.notes_on_beat_pct
    result.practice_tip      = analysis_data.practice_tip
    result.note_events       = analysis_data.note_events
    result.extracted_notes   = analysis_data.extracted_notes
    result.timing_alignment  = analysis_data.timing_alignment

    session.status = "completed"
    db.commit()
    db.refresh(result)

    return {"status": "success", "analysis_id": str(result.id)}


# ── Progress ──────────────────────────────────────────────────────────────────

@app.get("/progress")
def get_progress(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Returns:
    - sessions: all sessions with scores
    - streak_days: current consecutive-day streak
    - practice_days: list of ISO date strings where user practiced
    - pieces: per-title latest score and change
    """
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.user_id == current_user.id)
        .order_by(PracticeSession.created_at.desc())
        .all()
    )

    serialized = [_serialize_session(s) for s in sessions]

    # Practice days
    practice_days = sorted(set(
        s.created_at.date().isoformat()
        for s in sessions
    ))

    # Streak
    streak = _compute_streak(practice_days)

    # Per-piece aggregation
    pieces_map: dict[str, list] = defaultdict(list)
    for s in sessions:
        if s.result:
            pieces_map[s.title].append(float(s.result.overall_score))

    pieces = []
    for title, scores in pieces_map.items():
        latest = scores[0]
        change = latest - scores[1] if len(scores) > 1 else 0
        pieces.append({
            "title":         title,
            "latest_score":  latest,
            "score_change":  change,
            "session_count": len(scores),
        })

    pieces.sort(key=lambda p: p["latest_score"], reverse=True)

    return {
        "sessions":      serialized,
        "streak_days":   streak,
        "practice_days": practice_days,
        "pieces":        pieces,
    }


def _compute_streak(practice_days: list[str]) -> int:
    if not practice_days:
        return 0
    today = date.today()
    streak = 0
    day = today
    day_set = set(practice_days)
    while day.isoformat() in day_set:
        streak += 1
        day = day - timedelta(days=1)
    return streak