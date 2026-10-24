-- Migration v1 -> v2: Add extended fields to practice_sessions and analysis_results
-- Safe to run on existing v1 databases (idempotent ADD COLUMN IF NOT EXISTS).

-- ── practice_sessions ─────────────────────────────────────────────────────────
ALTER TABLE practice_sessions
    ADD COLUMN IF NOT EXISTS instrument   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS target_type  VARCHAR(20) DEFAULT 'scale',
    ADD COLUMN IF NOT EXISTS mode         VARCHAR(10) DEFAULT 'mono',
    ADD COLUMN IF NOT EXISTS bpm          INTEGER,
    ADD COLUMN IF NOT EXISTS tuning_hz    INTEGER DEFAULT 440;

-- ── analysis_results ──────────────────────────────────────────────────────────
ALTER TABLE analysis_results
    ADD COLUMN IF NOT EXISTS pitch_score       NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS timing_score      NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS in_tune_pct       NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS is_polyphonic     BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pitch_contour_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS avg_onset_ms      NUMERIC(7, 2),
    ADD COLUMN IF NOT EXISTS steadiness        NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS notes_on_beat_pct NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS practice_tip      TEXT,
    ADD COLUMN IF NOT EXISTS note_events       JSONB;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON practice_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON practice_sessions(status);
CREATE INDEX IF NOT EXISTS idx_results_session ON analysis_results(session_id);
