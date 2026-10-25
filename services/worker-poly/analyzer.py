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

def midi_to_name(midi: int) -> str:
    names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    return f"{names[midi % 12]}{midi // 12 - 1}"


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
        el      = "onBeat" if abs(err_ms) <= 25 else ("early" if err_ms < 0 else "late")
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
    if avg_ms > 60:
        tip = ("You tend to rush — try a metronome." if mean_signed > 0
               else "You tend to drag — try tapping your foot to the beat.")
    elif steady < 65:
        tip = "Focus on evenness: practice at half tempo with a metronome."
    else:
        tip = "Great timing! Keep recording weekly to maintain consistency."

    return {
        "timing_score":      round(score, 1),
        "avg_onset_ms":      round(avg_ms, 1),
        "steadiness":        round(steady, 1),
        "notes_on_beat_pct": round(pct, 1),
        "practice_tip":      tip,
    }


def analyze_polyphonic_file(
    file_path: str,
    bpm:       Optional[float] = None,
    tuning:    float = 440.0,
) -> dict:
    """
    Analyzes a local audio file with Basic Pitch and calculates note events,
    pitch intonation cents error, note labels, and timing metrics.
    """
    y, sr = librosa.load(file_path, sr=22050, mono=True)
    duration_s = float(len(y) / sr)

    # ── 1. Tempo ─────────────────────────────────────────────────────────
    if bpm is None or bpm <= 0:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        if bpm <= 0:
            bpm = 100.0

    # ── 2. Basic Pitch transcription ──────────────────────────────────────
    try:
        _, midi_data, note_events = basic_pitch_predict(
            file_path,
            model_or_model_path=ICASSP_2022_MODEL_PATH,
        )
    except Exception as e:
        print(f"Basic pitch predict warning: {e}")
        note_events = []

    # Fallback to onset detection if basic pitch found nothing
    if not note_events:
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=True)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        if len(onset_times) > 0:
            for idx, o in enumerate(onset_times):
                end_t = onset_times[idx + 1] if idx + 1 < len(onset_times) else min(o + 0.5, duration_s)
                # Estimate pitch in segment
                seg = y[int(o * sr):int(end_t * sr)]
                if len(seg) >= 2048:
                    pitches, magnitudes = librosa.piptrack(y=seg, sr=sr)
                    pitch_val = pitches[magnitudes > np.median(magnitudes)]
                    hz = float(np.median(pitch_val)) if len(pitch_val) > 0 and np.median(pitch_val) > 50 else 261.63
                else:
                    hz = 261.63
                midi_val = int(round(69.0 + 12.0 * math.log2(hz / tuning)))
                note_events.append((o, end_t, midi_val, 0.8))

    # ── 3. Build common note-event format with fine cents error ────────────
    notes: list[dict] = []
    # Sort note events chronologically
    sorted_events = sorted(note_events, key=lambda n: float(n[0]))

    for note in sorted_events:
        start_s = float(note[0])
        end_s   = float(note[1])
        midi    = int(note[2])
        amp     = float(note[3]) if len(note) > 3 else 1.0

        # Fine pitch intonation calculation using YIN around expected frequency
        expected_hz = 440.0 * (2.0 ** ((midi - 69.0) / 12.0))
        cents_err = 0.0

        start_idx = max(0, int(start_s * sr))
        end_idx   = min(len(y), int(end_s * sr))
        note_audio = y[start_idx:end_idx]

        if len(note_audio) >= 1024:
            fmin = max(30.0, expected_hz * 0.8)
            fmax = min(4000.0, expected_hz * 1.25)
            try:
                yin_f0 = librosa.yin(note_audio, fmin=fmin, fmax=fmax, sr=sr)
                valid_f0 = yin_f0[np.isfinite(yin_f0)]
                if len(valid_f0) > 0:
                    med_hz = float(np.median(valid_f0))
                    if med_hz > 0:
                        detected_midi = 69.0 + 12.0 * math.log2(med_hz / tuning)
                        raw_cents = (detected_midi - midi) * 100.0
                        # Cap outlier jumps to reasonable intonation range (-50c to +50c)
                        cents_err = round(float(np.clip(raw_cents, -49.0, 49.0)), 1)
            except Exception:
                cents_err = 0.0

        notes.append({
            "onset_s":       round(start_s, 4),
            "offset_s":      round(end_s,   4),
            "midi":          midi,
            "label":         midi_to_name(midi),
            "cents_error":   cents_err,
            "confidence":    round(amp, 3),
            "expected_midi": midi,
        })

    # ── 4. Timing alignment ───────────────────────────────────────────────
    notes = align_to_beat_grid(notes, bpm)

    # ── 5. Scoring ────────────────────────────────────────────────────────
    timing_metrics = compute_timing_score(notes)

    if notes:
        in_tune_notes = sum(1 for n in notes if abs(n["cents_error"]) <= 25)
        in_tune_pct   = round(100.0 * in_tune_notes / len(notes), 1)
        avg_cents     = round(float(np.mean([n["cents_error"] for n in notes])), 1)
        pitch_score   = round(max(0.0, min(100.0, in_tune_pct - max(0, abs(avg_cents) - 15) * 0.4)), 1)
    else:
        in_tune_pct   = 100.0
        avg_cents     = 0.0
        pitch_score   = 85.0

    overall_score = round((pitch_score * 0.5) + (timing_metrics["timing_score"] * 0.5), 1)

    return {
        "overall_score":     overall_score,
        "pitch_score":       pitch_score,
        "timing_score":      timing_metrics["timing_score"],

        # Pitch
        "in_tune_pct":       in_tune_pct,
        "avg_cents_error":   avg_cents,
        "is_polyphonic":     True,
        "pitch_contour_url": None,

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


# ── Main entry point (GCS) ───────────────────────────────────────────────────

def analyze_polyphonic_audio(
    gcs_bucket: str,
    gcs_path:   str,
    bpm:        Optional[float] = None,
    tuning:     float = 440.0,
) -> dict:
    bucket = storage_client.bucket(gcs_bucket)
    blob   = bucket.blob(gcs_path)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        blob.download_to_filename(tmp.name)
        temp_path = tmp.name

    try:
        return analyze_polyphonic_file(temp_path, bpm, tuning)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)