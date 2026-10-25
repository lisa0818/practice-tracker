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


def measure_note_cents(
    y: np.ndarray, sr: int, start_s: float, end_s: float, midi: int, tuning: float = 440.0,
) -> Optional[float]:
    """
    Intonation of one note inside a chord. A whole-signal pitch tracker like YIN
    locks onto whichever chord tone is loudest, so instead look for this note's
    own spectral peak within ±45¢ of where it should be. Returns None when there
    is no clear peak (the note can't be measured), rather than a fake error.
    """
    seg = y[int((start_s + 0.03) * sr):int(min(end_s, start_s + 1.0) * sr)]
    if len(seg) < int(0.12 * sr):
        return None

    f0 = tuning * 2.0 ** ((midi - 69) / 12.0)
    # Low fundamentals are too close together to resolve; use the 2nd harmonic
    harmonic = 1 if f0 >= 150 else 2
    target = f0 * harmonic
    if target > 0.45 * sr:
        return None

    n_fft = 1 << int(np.ceil(np.log2(len(seg) * 4)))   # zero-pad for finer peak picking
    spec  = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n_fft))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)

    band = np.where((freqs >= target * 2 ** (-0.45 / 12)) & (freqs <= target * 2 ** (0.45 / 12)))[0]
    if len(band) < 3:
        return None
    k = band[np.argmax(spec[band])]
    if k == band[0] or k == band[-1]:
        return None   # still rising at the edge: the energy belongs to a neighbouring note
    wide = (freqs >= target * 2 ** (-1 / 12)) & (freqs <= target * 2 ** (1 / 12))
    if spec[k] < 3.0 * np.median(spec[wide]):
        return None   # no clear peak — note too quiet or masked

    a, b, c = np.log(spec[k - 1:k + 2] + 1e-12)
    p = 0.5 * (a - c) / (a - 2 * b + c)
    peak_hz = (k + p) * sr / n_fft
    return round(float(1200.0 * np.log2(peak_hz / target)), 1)


MIN_TIMING_AMP   = 0.5    # weaker notes are mostly transcription ghosts
PULSE_WINDOW_S   = 6.0    # follow the player's tempo over a window this long
MIN_STRIKES      = 12
MIN_ABOVE_CHANCE = 0.15   # on-beat share must beat shuffled-rhythm chance by this much


def _local_grid_errors(strikes: np.ndarray, pmin: float = 0.25, pmax: float = 0.8) -> np.ndarray:
    """
    Timing error (ms) of each strike against the pulse of its neighbourhood.
    A fresh period/phase is fitted around every strike, so a player who speeds
    up or slows down is judged against their own tempo, not a fixed metronome.
    NaN where there are too few nearby strikes to find a pulse.
    """
    periods = np.arange(pmin, pmax, 0.004)
    errs = np.full(len(strikes), np.nan)
    for i, t in enumerate(strikes):
        w = strikes[(strikes >= t - PULSE_WINDOW_S / 2) & (strikes <= t + PULSE_WINDOW_S / 2)]
        if len(w) < 6:
            continue
        z = np.exp(2j * np.pi * w[None, :] / periods[:, None]).mean(axis=1)
        k = int(np.argmax(np.abs(z)))
        p = periods[k]
        phase = np.angle(z[k]) / (2 * np.pi) * p
        errs[i] = ((t - phase + p / 2) % p - p / 2) * 1000.0
    return errs


def _chance_on_beat(strikes: np.ndarray, tol_ms: float) -> float:
    """
    On-beat share the same number of strikes would get with no pulse at all:
    spread uniformly at random over the same stretch of time. (Shuffling the
    gaps would not do, since shuffling a regular rhythm leaves it regular.)
    """
    rng = np.random.default_rng(0)
    shares = []
    for _ in range(8):
        fake = np.sort(rng.uniform(strikes[0], strikes[-1], len(strikes)))
        e = _local_grid_errors(fake)
        e = e[np.isfinite(e)]
        if len(e):
            shares.append(float(np.mean(np.abs(e) <= tol_ms)))
    return float(np.mean(shares)) if shares else 1.0


def align_to_beat_grid(notes: list[dict], bpm: float = 0.0) -> tuple[list[dict], bool]:
    """
    Add onset_error_ms / early_late per strike. Notes that start together (a
    chord or strum) are one timing event, and only clear notes are used.
    Returns (notes, reliable). Timing is only reported when the strikes sit on a
    pulse noticeably more than shuffled rhythm would by chance; busy or free
    rhythms can't be judged from note onsets, and a number would be made up.
    """
    annotated = [dict(n) for n in notes]
    strong = sorted(
        (i for i, n in enumerate(notes) if n.get("confidence", 1.0) >= MIN_TIMING_AMP),
        key=lambda i: notes[i]["onset_s"],
    )
    groups: list[list[int]] = []
    for i in strong:
        if groups and notes[i]["onset_s"] - notes[groups[-1][0]]["onset_s"] <= 0.05:
            groups[-1].append(i)
        else:
            groups.append([i])
    if len(groups) < MIN_STRIKES:
        return annotated, False

    strikes = np.array([notes[g[0]]["onset_s"] for g in groups])
    errs = _local_grid_errors(strikes)
    ok = np.isfinite(errs)
    tol_ms = 60.0
    if ok.sum() < MIN_STRIKES:
        return annotated, False

    share  = float(np.mean(np.abs(errs[ok]) <= tol_ms))
    chance = _chance_on_beat(strikes, tol_ms)
    if share - chance < MIN_ABOVE_CHANCE:
        return annotated, False

    for g, e in zip(groups, errs):
        if np.isfinite(e):
            el = "onBeat" if abs(e) <= tol_ms else ("early" if e < 0 else "late")
            annotated[g[0]].update({"onset_error_ms": round(float(e), 1), "early_late": el})
    return annotated, True


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

        # Intonation of this note's own partial (None if it can't be isolated)
        cents_err = measure_note_cents(y, sr, start_s, end_s, midi, tuning)

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
    notes, timing_reliable = align_to_beat_grid(notes, bpm)

    # ── 5. Scoring ────────────────────────────────────────────────────────
    if timing_reliable:
        timing_metrics = compute_timing_score(notes)
    else:
        timing_metrics = {
            "timing_score": None, "avg_onset_ms": None, "steadiness": None,
            "notes_on_beat_pct": None,
            "practice_tip": "No steady pulse could be found in this recording (busy or free rhythm), "
                            "so timing isn't scored. Pitch is unaffected. Try a simpler passage played "
                            "to a metronome for a timing score.",
        }

    measured = [n["cents_error"] for n in notes if n["cents_error"] is not None]
    if measured:
        in_tune_notes = sum(1 for c in measured if abs(c) <= 25)
        in_tune_pct   = round(100.0 * in_tune_notes / len(measured), 1)
        avg_cents     = round(float(np.mean(measured)), 1)
        pitch_score   = round(max(0.0, min(100.0, in_tune_pct - max(0, abs(avg_cents) - 15) * 0.4)), 1)
    else:
        in_tune_pct   = 100.0
        avg_cents     = 0.0
        pitch_score   = 85.0

    if timing_reliable:
        overall_score = round((pitch_score * 0.5) + (timing_metrics["timing_score"] * 0.5), 1)
    else:
        overall_score = round(pitch_score, 1)   # no timing score to blend in

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
            "status":    "analyzed" if timing_reliable else "timing_unreliable",
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