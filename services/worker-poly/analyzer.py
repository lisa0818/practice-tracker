"""
Polyphonic audio analyzer — Spotify Basic Pitch.
Outputs the common note-event format.
NOTE: cents_error is NULL for polyphonic instruments — Basic Pitch is NOT
reliable for fine intonation. Only onset timing is reported.
"""

import os
import tempfile
import math
from typing import Optional
from pathlib import Path

import numpy as np
from google.cloud import storage
import librosa
from basic_pitch.inference import predict as basic_pitch_predict
from basic_pitch import ICASSP_2022_MODEL_PATH

# ── Storage client ────────────────────────────────────────────────────────────
BASE_DIR  = Path(__file__).resolve().parent.parent.parent
KEY_PATH  = BASE_DIR / "service-account-key.json"

if KEY_PATH.exists():
    storage_client = storage.Client.from_service_account_json(str(KEY_PATH))
else:
    storage_client = storage.Client()


# ── Helpers ───────────────────────────────────────────────────────────────────

def align_to_beat_grid(notes: list[dict], bpm: float) -> list[dict]:
    """Add onset_error_ms and early_late to each note."""
    if bpm <= 0 or not notes:
        return notes
    beat_period = 60.0 / bpm
    annotated   = []
    for note in notes:
        onset   = note["onset_s"]
        beat_n  = round(onset / beat_period)
        nearest = beat_n * beat_period
        err_ms  = (onset - nearest) * 1000.0
        el      = "onBeat" if abs(err_ms) <= 20 else ("early" if err_ms < 0 else "late")
        annotated.append({**note, "onset_error_ms": round(err_ms, 1), "early_late": el})
    return annotated


def compute_timing_score(notes: list[dict]) -> dict:
    onset_notes = [n for n in notes if "onset_error_ms" in n]
    if not onset_notes:
        return {
            "timing_score": 0.0, "avg_onset_ms": 0.0,
            "steadiness": 0.0, "notes_on_beat_pct": 0.0, "practice_tip": None,
        }
    errors = [n["onset_error_ms"] for n in onset_notes]
    avg_ms = float(np.mean(np.abs(errors)))
    std_ms = float(np.std(errors))
    on_beat = sum(1 for n in onset_notes if n["early_late"] == "onBeat")
    pct     = 100.0 * on_beat / len(onset_notes)
    steady  = max(0.0, min(100.0, 100.0 - std_ms * 0.5))
    score   = max(0.0, min(100.0, pct * 0.6 + steady * 0.4))

    mean_signed = float(np.mean(errors))
    if avg_ms > 80:
        tip = ("You tend to rush — try a metronome." if mean_signed > 0
               else "You tend to drag — try tapping your foot to the beat.")
    elif steady < 60:
        tip = "Focus on evenness: practice at half tempo with a metronome."
    else:
        tip = "Great timing! Keep recording weekly to maintain consistency."

    return {
        "timing_score":      round(score, 2),
        "avg_onset_ms":      round(avg_ms, 2),
        "steadiness":        round(steady, 2),
        "notes_on_beat_pct": round(pct, 2),
        "practice_tip":      tip,
    }


# ── Main entry point ──────────────────────────────────────────────────────────

def analyze_polyphonic_audio(
    gcs_bucket: str,
    gcs_path:   str,
    bpm:        Optional[float] = None,
    tuning:     float = 440.0,
) -> dict:
    """
    Full polyphonic analysis pipeline using Basic Pitch.
    cents_error is None for all notes (polyphonic instruments don't have intonation accuracy).
    """
    bucket = storage_client.bucket(gcs_bucket)
    blob   = bucket.blob(gcs_path)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        blob.download_to_filename(tmp.name)
        temp_path = tmp.name

    try:
        y, sr = librosa.load(temp_path, sr=22050, mono=True)

        # ── 1. Tempo ─────────────────────────────────────────────────────────
        if bpm is None:
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)

        # ── 2. Basic Pitch transcription ──────────────────────────────────────
        _, midi_data, note_events = basic_pitch_predict(
            temp_path,
            model_or_model_path=ICASSP_2022_MODEL_PATH,
        )

        # ── 3. Build common note-event format ─────────────────────────────────
        # Basic Pitch note_events: (start_s, end_s, pitch_midi, amplitude, [pitch_bends])
        notes: list[dict] = []
        for note in note_events:
            start_s = float(note[0])
            end_s   = float(note[1])
            midi    = int(note[2])
            amp     = float(note[3]) if len(note) > 3 else 1.0
            notes.append({
                "onset_s":    round(start_s, 4),
                "offset_s":   round(end_s,   4),
                "midi":       midi,
                "cents_error":None,   # Not available for polyphonic
                "confidence": round(amp, 3),
                "label":      None,
                "expected_midi": None,
            })

        # ── 4. Timing alignment ───────────────────────────────────────────────
        notes = align_to_beat_grid(notes, bpm)

        # ── 5. Scoring ────────────────────────────────────────────────────────
        timing_metrics = compute_timing_score(notes)

        # Overall score: timing only (no pitch accuracy for poly)
        overall_score = timing_metrics["timing_score"]

        return {
            "overall_score":     round(overall_score, 2),
            "pitch_score":       None,   # N/A
            "timing_score":      timing_metrics["timing_score"],

            # Pitch
            "in_tune_pct":       None,
            "avg_cents_error":   0.0,
            "is_polyphonic":     True,

            # Timing
            "avg_onset_ms":      timing_metrics["avg_onset_ms"],
            "steadiness":        timing_metrics["steadiness"],
            "notes_on_beat_pct": timing_metrics["notes_on_beat_pct"],
            "practice_tip":      timing_metrics["practice_tip"],

            # Note events
            "note_events": notes,

            # Backward compat
            "extracted_notes": {
                "total_notes": len(notes),
                "detected_bpm": round(bpm, 1),
            },
            "timing_alignment": {
                "status":    "analyzed",
                "detected_bpm": round(bpm, 1),
            },
        }

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)