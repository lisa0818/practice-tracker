"""
Per-piece progress: decide which uploads are the same piece, and summarise
how the player is improving across attempts.
"""

import re
from difflib import SequenceMatcher
from typing import Optional

# Two recordings count as the same piece when their melodies are this similar.
MELODY_MATCH_THRESHOLD = 0.68   # unrelated tunes score ~0.1–0.3, the same tune ≥ 0.7
MIN_INTERVALS = 4   # too short a phrase to compare reliably


# ── Identifying a piece ───────────────────────────────────────────────────────

def normalize_title(title: Optional[str]) -> str:
    """'Twinkle_Twinkle (2).mp3' and 'twinkle twinkle copy' → 'twinkle twinkle'."""
    t = (title or "").lower()
    t = re.sub(r"\.(mp3|wav|m4a|aac|flac|ogg|webm)$", "", t)
    t = re.sub(r"[\(\[]\s*\d+\s*[\)\]]", " ", t)                  # "(2)"
    t = re.sub(r"\b(copy|(take|attempt|try|v)\s*\d+)\b", " ", t)  # "copy", "take 3", "v2"
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return " ".join(t.split()) or "recording"


def title_key(title: Optional[str], instrument: Optional[str]) -> str:
    return f"{normalize_title(title)}|{(instrument or '').strip().lower()}"


def melody_signature(note_events: Optional[list]) -> list[int]:
    """
    Pitch intervals between consecutive distinct notes. Transposition-proof, and
    repeated notes are collapsed because the analyzer sometimes merges or splits
    them depending on how the bow was changed.
    """
    pitches: list[int] = []
    for n in note_events or []:
        m = n.get("midi")
        if m is None:
            continue
        if not pitches or pitches[-1] != m:
            pitches.append(int(m))
    return [b - a for a, b in zip(pitches, pitches[1:])]


def melody_similarity(a: list[int], b: list[int]) -> float:
    if len(a) < MIN_INTERVALS or len(b) < MIN_INTERVALS:
        return 0.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


# ── Building the progress payload ─────────────────────────────────────────────

def _num(x) -> Optional[float]:
    return None if x is None else float(x)


def _attempt(session) -> dict:
    r = session.result
    return {
        "session_id":        str(session.id),
        "created_at":        session.created_at.isoformat() if session.created_at else None,
        "overall_score":     _num(r.overall_score),
        "pitch_score":       _num(r.pitch_score),
        "timing_score":      _num(r.timing_score),
        "in_tune_pct":       _num(r.in_tune_pct),
        "notes_on_beat_pct": _num(r.notes_on_beat_pct),
        "avg_cents_error":   _num(r.avg_cents_error),
        "steadiness":        _num(r.steadiness),
        "practice_tip":      r.practice_tip,
    }


def _delta(latest: Optional[float], earlier: Optional[float]) -> Optional[float]:
    if latest is None or earlier is None:
        return None
    return round(latest - earlier, 1)


def summarize(attempts: list[dict]) -> dict:
    """Plain-language summary comparing the latest attempt with earlier ones."""
    latest = attempts[-1]
    n = len(attempts)
    pitch, timing = latest["pitch_score"], latest["timing_score"]

    bullets: list[str] = []

    if n == 1:
        headline, tone = "First attempt recorded", "flat"
        bullets.append("Practice this piece and upload it again to see your improvement here.")
    else:
        first, prev = attempts[0], attempts[-2]
        total = _delta(latest["overall_score"], first["overall_score"]) or 0.0
        step = _delta(latest["overall_score"], prev["overall_score"]) or 0.0

        if total >= 1:
            headline, tone = f"Up {total:.0f} points since your first attempt", "up"
        elif total <= -1:
            headline, tone = f"Down {abs(total):.0f} points since your first attempt", "down"
        else:
            headline, tone = "Holding steady since your first attempt", "flat"

        if abs(step) >= 1:
            bullets.append(f"{'Better' if step > 0 else 'Lower'} than your last attempt by {abs(step):.0f} points.")
        else:
            bullets.append("About the same as your last attempt.")

        for label, key in (("Pitch", "pitch_score"), ("Timing", "timing_score")):
            d = _delta(latest[key], first[key])
            if d is not None and abs(d) >= 1:
                bullets.append(f"{label} {'improved' if d > 0 else 'dropped'} by {abs(d):.0f} points ({first[key]:.0f} → {latest[key]:.0f}).")

        best_i = max(range(n), key=lambda i: attempts[i]["overall_score"] or 0)
        if best_i == n - 1:
            bullets.append("This is your best attempt so far.")
        else:
            bullets.append(f"Your best was attempt {best_i + 1} (score {attempts[best_i]['overall_score']:.0f}).")

    if pitch is not None and timing is not None and abs(pitch - timing) >= 10:
        weaker, stronger = ("Timing", "pitch") if timing < pitch else ("Pitch", "timing")
        tip = "try a metronome at a slower tempo" if weaker == "Timing" else "slow practice with a tuner will help"
        bullets.append(f"{weaker} is the area to work on next — {tip}.")
    if latest.get("practice_tip"):
        bullets.append(latest["practice_tip"])

    return {"headline": headline, "tone": tone, "bullets": bullets}


def build_piece(key: str, sessions: list) -> dict:
    """sessions: that piece's completed sessions with results, any order."""
    ordered = sorted(sessions, key=lambda s: s.created_at)
    attempts = [_attempt(s) for s in ordered]
    latest, first = attempts[-1], attempts[0]
    prev = attempts[-2] if len(attempts) > 1 else None
    newest = ordered[-1]

    return {
        "piece_key":     key,
        "title":         newest.title,
        "instrument":    newest.instrument,
        "session_count": len(attempts),
        "latest_score":  latest["overall_score"],
        "score_change":  _delta(latest["overall_score"], prev["overall_score"]) if prev else 0,
        "first_score":   first["overall_score"],
        "best_score":    max(a["overall_score"] or 0 for a in attempts),
        "last_practiced": latest["created_at"],
        "attempts":      attempts,
        "summary":       summarize(attempts),
    }
