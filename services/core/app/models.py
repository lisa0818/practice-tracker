import uuid
from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    Numeric,
    String,
    Text,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name       = Column(String(100), nullable=True)
    role            = Column(String(20),  nullable=False, default="student")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    sessions = relationship("PracticeSession", back_populates="user")


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title          = Column(String(200), nullable=False)
    target_scale   = Column(String(100), nullable=False)
    instrument     = Column(String(50),  nullable=True)
    target_type    = Column(String(20),  nullable=True, default="scale")
    mode           = Column(String(10),  nullable=True, default="mono")
    bpm            = Column(Integer,     nullable=True)
    tuning_hz      = Column(Integer,     nullable=True, default=440)
    audio_gcs_path = Column(String(500), nullable=True)
    status         = Column(String(20),  nullable=False, default="pending")
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    user   = relationship("User", back_populates="sessions")
    result = relationship("AnalysisResult", back_populates="session", uselist=False)


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id        = Column(UUID(as_uuid=True), ForeignKey("practice_sessions.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Scores
    overall_score     = Column(Numeric(5, 2),  nullable=False, default=0)
    pitch_score       = Column(Numeric(5, 2),  nullable=True)
    timing_score      = Column(Numeric(5, 2),  nullable=True)

    # Pitch metrics
    in_tune_pct       = Column(Numeric(5, 2),  nullable=True)
    avg_cents_error   = Column(Numeric(6, 2),  nullable=True, default=0)
    is_polyphonic     = Column(Boolean,        nullable=True, default=False)
    pitch_contour_url = Column(String(500),    nullable=True)

    # Timing metrics
    avg_onset_ms      = Column(Numeric(7, 2),  nullable=True)
    steadiness        = Column(Numeric(5, 2),  nullable=True)
    notes_on_beat_pct = Column(Numeric(5, 2),  nullable=True)
    practice_tip      = Column(Text,           nullable=True)

    # Note events (common format)
    note_events       = Column(JSONB,          nullable=True)

    # Kept for backward compat
    extracted_notes   = Column(JSONB,          nullable=True)
    timing_alignment  = Column(JSONB,          nullable=True)

    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("PracticeSession", back_populates="result")