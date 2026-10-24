"""
Monophonic audio analyzer — CREPE via torchcrepe.
Outputs the common note-event format:
  {onset_s, offset_s, midi, cents_error, confidence, onset_error_ms, early_late}
"""

import os
import subprocess
import tempfile
import math
from typing import Optional

import numpy as np
from google.cloud import storage
import google.auth
import librosa
import torch
import torchcrepe

# ── Storage client ────────────────────────────────────────────────────────────

root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
key_path = os.path.join(root_dir, "service-account-key.json")

if os.path.exists(key_path):
    credentials, project_id = google.auth.load_credentials_from_file(key_path)
    storage_client = storage.Client(credentials=credentials, project=project_id)
else:
    storage_client = storage.Client()


# ── MIDI helpers ──────────────────────────────────────────────────────────────

def hz_to_midi(hz: float, tuning: float = 440.0) -> float:
    """Convert frequency in Hz to fractional MIDI note number."""
    if hz <= 0:
        return 0.0
    return 69.0 + 12.0 * math.log2(hz / tuning)


def midi_to_name(midi: int) -> str:
    names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    return f"{names[midi % 12]}{midi // 12 - 1}"


def cents_error(detected_midi: float, target_midi: int) -> float:
    """Signed cents error: positive = sharp, negative = flat."""
    return (detected_midi - target_midi) * 100.0


# ── Note segmentation from CREPE output ───────────────────────────────────────

def segment_notes(
    times:       np.ndarray,     # (T,) frame times in seconds
    pitches:     np.ndarray,     # (T,) frame pitches in Hz
    periodicity: np.ndarray,     # (T,) confidence 0-1
    tuning:      float = 440.0,
    conf_thresh: float = 0.5,
    min_note_s:  float = 0.05,   # minimum note duration
    silence_gap: float = 0.04,   # gap to split notes
) -> list[dict]:
    """
    Segment CREPE frame output into note events.
    Returns list of {onset_s, offset_s, midi, avg_hz, confidence, cents_error}.
    """
    notes = []
    in_note       = False
    note_start    = 0.0
    note_frames   = []
    note_conf     = []

    for i, (t, hz, conf) in enumerate(zip(times, pitches, periodicity)):
        voiced = conf >= conf_thresh and hz > 0

        if voiced and not in_note:
            in_note    = True
            note_start = float(t)
            note_frames = [hz]
            note_conf   = [float(conf)]

        elif voiced and in_note:
            # Check for large pitch jump (octave error guard ±1 octave)
            prev_midi = hz_to_midi(note_frames[-1], tuning)
            curr_midi = hz_to_midi(hz, tuning)
            if abs(curr_midi - prev_midi) > 12:
                # End old note, start new
                _close_note(notes, note_frames, note_conf, note_start, float(t), tuning, min_note_s)
                note_start  = float(t)
                note_frames = [hz]
                note_conf   = [float(conf)]
            else:
                note_frames.append(hz)
                note_conf.append(float(conf))

        elif not voiced and in_note:
            # Check if the gap is long enough to close the note
            _close_note(notes, note_frames, note_conf, note_start, float(t), tuning, min_note_s)
            in_note = False
            note_frames = []
            note_conf   = []

    # Close any trailing note
    if in_note and note_frames:
        _close_note(notes, note_frames, note_conf, note_start, float(times[-1]), tuning, min_note_s)

    return notes


def _close_note(notes, frames, conf_list, start, end, tuning, min_dur):
    if end - start < min_dur:
        return
    avg_hz   = float(np.median(frames))
    avg_conf = float(np.mean(conf_list))
    frac_midi = hz_to_midi(avg_hz, tuning)
    nearest   = round(frac_midi)
    err       = cents_error(frac_midi, nearest)
    notes.append({
        "onset_s":    round(start, 4),
        "offset_s":   round(end,   4),
        "midi":       nearest,
        "avg_hz":     round(avg_hz, 2),
        "cents_error":round(err, 2),
        "confidence": round(avg_conf, 3),
    })


# ── Timing alignment ──────────────────────────────────────────────────────────

def align_to_beat_grid(
    notes:      list[dict],
    bpm:        float,
    offset_s:   float = 0.0,
    tuning:     float = 440.0,
) -> list[dict]:
    """
    Compute onset_error_ms and early_late for each note vs a regular beat grid.
    """
    if bpm <= 0 or not notes:
        return notes

    beat_period = 60.0 / bpm
    annotated   = []
    for note in notes:
        onset = note["onset_s"]
        # Find nearest beat
        beat_num = round((onset - offset_s) / beat_period)
        nearest_beat = offset_s + beat_num * beat_period
        err_ms = (onset - nearest_beat) * 1000.0

        if abs(err_ms) <= 20:
            el = "onBeat"
        elif err_ms < 0:
            el = "early"
        else:
            el = "late"

        annotated.append({**note, "onset_error_ms": round(err_ms, 1), "early_late": el})

    return annotated


# ── Scoring ───────────────────────────────────────────────────────────────────

def compute_pitch_score(notes: list[dict]) -> dict:
    """Compute pitch score metrics from note events."""
    if not notes:
        return {"pitch_score": 0.0, "in_tune_pct": 0.0, "avg_cents_error": 0.0}

    errors = [abs(n["cents_error"]) for n in notes]
    in_tune = sum(1 for e in errors if e <= 25)
    in_tune_pct    = 100.0 * in_tune / len(errors)
    avg_cents_error = float(np.mean(errors))

    # Score: 100 when all in-tune, penalized by average error
    pitch_score = max(0.0, min(100.0, in_tune_pct - max(0, avg_cents_error - 25) * 0.4))
    return {
        "pitch_score":    round(pitch_score, 2),
        "in_tune_pct":    round(in_tune_pct, 2),
        "avg_cents_error":round(avg_cents_error, 2),
    }


def compute_timing_score(notes: list[dict]) -> dict:
    """Compute timing score metrics from note events with onset_error_ms."""
    onset_notes = [n for n in notes if "onset_error_ms" in n]
    if not onset_notes:
        return {"timing_score": 0.0, "avg_onset_ms": 0.0, "steadiness": 0.0, "notes_on_beat_pct": 0.0, "practice_tip": None}

    errors = [n["onset_error_ms"] for n in onset_notes]
    avg_onset_ms      = float(np.mean(np.abs(errors)))
    std_onset_ms      = float(np.std(errors))
    on_beat           = sum(1 for n in onset_notes if n["early_late"] == "onBeat")
    notes_on_beat_pct = 100.0 * on_beat / len(onset_notes)
    steadiness        = max(0.0, min(100.0, 100.0 - std_onset_ms * 0.5))
    timing_score      = max(0.0, min(100.0, (notes_on_beat_pct * 0.6) + (steadiness * 0.4)))

    # Practice tip
    mean_signed  = float(np.mean(errors))
    if avg_onset_ms > 80:
        tip = ("You tend to rush — try counting eighth notes aloud or with a metronome." if mean_signed > 0
               else "You tend to drag — try tapping your foot to the beat while playing.")
    elif steadiness < 60:
        tip = "Focus on evenness: use a metronome at half your current tempo until each note lands solidly on the beat."
    else:
        tip = "Great timing! Keep consistent by recording yourself weekly and checking the onset chart."

    return {
        "timing_score":      round(timing_score, 2),
        "avg_onset_ms":      round(avg_onset_ms, 2),
        "steadiness":        round(steadiness, 2),
        "notes_on_beat_pct": round(notes_on_beat_pct, 2),
        "practice_tip":      tip,
    }


# ── Main entry point ──────────────────────────────────────────────────────────

def analyze_audio_file(
    bucket_name: str,
    gcs_path:    str,
    bpm:         Optional[float] = None,
    tuning:      float = 440.0,
) -> dict:
    """
    Full monophonic analysis pipeline.
    Returns a dict matching the AnalysisSubmit schema.
    """
    bucket   = storage_client.bucket(bucket_name)
    blob     = bucket.blob(gcs_path)
    temp_dir = tempfile.gettempdir()
    raw_path = os.path.join(temp_dir, "raw_mono.bin")
    wav_path = os.path.join(temp_dir, "std_mono.wav")

    try:
        blob.download_to_filename(raw_path)
        file_size = os.path.getsize(raw_path)
        if file_size == 0:
            raise ValueError(f"Downloaded file is empty: {gcs_path}")

        # Convert to 22.05 kHz mono WAV
        subprocess.run(
            ["ffmpeg", "-y", "-i", raw_path,
             "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )

        y, sr = librosa.load(wav_path, sr=22050, mono=True)

        # ── 1. Tempo / beat tracking ─────────────────────────────────────────
        if bpm is None:
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)

        # ── 2. CREPE pitch estimation ────────────────────────────────────────
        hop_length   = 220   # ~10 ms at 22050 Hz
        audio_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(0)

        pitches_t, periodicity_t = torchcrepe.predict(
            audio_tensor, sr, hop_length,
            fmin=50.0, fmax=2000.0,
            model="tiny",
            batch_size=2048,
            device="cpu",
            decoder=torchcrepe.decode.viterbi,
            return_periodicity=True,
        )

        pitches_np     = pitches_t.squeeze(0).cpu().numpy()       # (T,)
        periodicity_np = periodicity_t.squeeze(0).cpu().numpy()   # (T,)
        times_np       = np.arange(len(pitches_np)) * hop_length / sr

        # ── 3. Note segmentation ──────────────────────────────────────────────
        raw_notes = segment_notes(
            times_np, pitches_np, periodicity_np,
            tuning=tuning, conf_thresh=0.5, min_note_s=0.05,
        )

        # ── 4. Timing alignment ───────────────────────────────────────────────
        notes = align_to_beat_grid(raw_notes, bpm, tuning=tuning)

        # ── 5. Scoring ────────────────────────────────────────────────────────
        pitch_metrics  = compute_pitch_score(notes)
        timing_metrics = compute_timing_score(notes)

        overall_score = (pitch_metrics["pitch_score"] * 0.6
                         + timing_metrics["timing_score"] * 0.4)

        return {
            "overall_score":     round(overall_score, 2),
            "pitch_score":       pitch_metrics["pitch_score"],
            "timing_score":      timing_metrics["timing_score"],

            # Pitch
            "in_tune_pct":       pitch_metrics["in_tune_pct"],
            "avg_cents_error":   pitch_metrics["avg_cents_error"],
            "is_polyphonic":     False,

            # Timing
            "avg_onset_ms":      timing_metrics["avg_onset_ms"],
            "steadiness":        timing_metrics["steadiness"],
            "notes_on_beat_pct": timing_metrics["notes_on_beat_pct"],
            "practice_tip":      timing_metrics["practice_tip"],

            # Note events (common format)
            "note_events": notes,

            # Backward compat
            "extracted_notes":  {
                "total_notes":       len(notes),
                "detected_bpm":      round(bpm, 1),
            },
            "timing_alignment": {
                "status":            "analyzed",
                "detected_bpm":      round(bpm, 1),
            },
        }

    finally:
        for p in [raw_path, wav_path]:
            if os.path.exists(p):
                os.remove(p)