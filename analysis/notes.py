import librosa
import numpy as np


def extract_notes_from_frames(
    frames: list[dict],
    audio_path: str,
    min_note_duration_s: float = 0.08,
    max_cents_variance: float = 60.0,
) -> list[dict]:
    """Segment frame-level CREPE data into discrete note events with onset/offset bounds."""
    if not frames:
        return []

    # Detect physical note attacks/onsets using spectral flux in librosa
    y, sr = librosa.load(audio_path, sr=16000, mono=True)
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=True)
    onset_times = set(np.round(librosa.frames_to_time(onset_frames, sr=sr), 2))

    notes = []
    current_segment = []

    for frame in frames:
        time_s = frame["time_s"]

        # Check if frame matches current segment pitch or hits an onset boundary
        is_onset = any(abs(time_s - ot) <= 0.02 for ot in onset_times)

        if not current_segment:
            current_segment.append(frame)
            continue

        prev_midi = current_segment[-1]["midi"]
        midi_diff = abs(frame["midi"] - prev_midi)

        if midi_diff == 0 and not is_onset:
            current_segment.append(frame)
        else:
            # Complete previous segment if long enough
            note_event = finalize_segment(current_segment, min_note_duration_s)
            if note_event:
                notes.append(note_event)
            current_segment = [frame]

    # Flush final segment
    note_event = finalize_segment(current_segment, min_note_duration_s)
    if note_event:
        notes.append(note_event)

    return notes


def finalize_segment(segment: list[dict], min_duration: float) -> dict | None:
    if not segment:
        return None

    onset_s = segment[0]["time_s"]
    offset_s = segment[-1]["time_s"]
    duration = offset_s - onset_s

    if duration < min_duration:
        return None

    avg_midi = int(round(np.mean([f["midi"] for f in segment])))
    avg_cents = float(np.mean([f["cents_error"] for f in segment]))
    avg_conf = float(np.mean([f["confidence"] for f in segment]))

    # Target shape used across mono and polyphonic workers
    return {
        "onset_s": round(onset_s, 2),
        "offset_s": round(offset_s, 2),
        "duration_s": round(duration, 2),
        "midi": avg_midi,
        "cents_error": round(avg_cents, 1),
        "confidence": round(avg_conf, 2),
    }


if __name__ == "__main__":
    import sys
    from pitch import extract_pitch

    sample_file = sys.argv[1] if len(sys.argv) > 1 else "audio_samples/scale.wav"
    frames = extract_pitch(sample_file)
    notes = extract_notes_from_frames(frames, sample_file)

    print(f"\nExtracted {len(notes)} discrete notes:")
    for n in notes:
        print(
            f"MIDI {n['midi']} | {n['onset_s']}s - {n['offset_s']}s | Err: {n['cents_error']} cents"
        )