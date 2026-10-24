-- Practice Tracker — PostgreSQL schema v2
-- Extended to support full pitch/timing result fields and progress queries.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100),
    role            VARCHAR(20)  NOT NULL DEFAULT 'student',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── Practice sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    target_scale    VARCHAR(100) NOT NULL,
    instrument      VARCHAR(50),
    target_type     VARCHAR(20)  DEFAULT 'scale',  -- 'scale' | 'melody' | 'reference'
    mode            VARCHAR(10)  DEFAULT 'mono',   -- 'mono' | 'poly'
    bpm             INTEGER,
    tuning_hz       INTEGER      DEFAULT 440,
    audio_gcs_path  VARCHAR(500),
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── Analysis results ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analysis_results (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id        UUID UNIQUE NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,

    -- Scores (0-100)
    overall_score     NUMERIC(5, 2) NOT NULL DEFAULT 0,
    pitch_score       NUMERIC(5, 2),
    timing_score      NUMERIC(5, 2),

    -- Pitch metrics
    in_tune_pct       NUMERIC(5, 2),   -- % frames within ±25 cents
    avg_cents_error   NUMERIC(6, 2),
    is_polyphonic     BOOLEAN DEFAULT FALSE,
    pitch_contour_url VARCHAR(500),    -- GCS URL of saved contour JSON

    -- Timing metrics
    avg_onset_ms      NUMERIC(7, 2),   -- average onset offset in ms
    steadiness        NUMERIC(5, 2),   -- std-dev based steadiness 0-100
    notes_on_beat_pct NUMERIC(5, 2),   -- % notes within ±20ms of beat grid
    practice_tip      TEXT,

    -- Full note events (common format)
    -- [{onset_s, offset_s, midi, cents_error, confidence, onset_error_ms, early_late}]
    note_events       JSONB,
    extracted_notes   JSONB,           -- kept for backward compat
    timing_alignment  JSONB,           -- kept for backward compat

    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON practice_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status  ON practice_sessions(status);
CREATE INDEX IF NOT EXISTS idx_results_session  ON analysis_results(session_id);