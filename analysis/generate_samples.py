import os
import sys
from pathlib import Path

# Fix import pathing
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from scipy.io import wavfile

SAMPLE_RATE = 16000  # Matching CREPE's required 16 kHz rate
DURATION_PER_NOTE = 1.0  # 1 second per note (~8-10 seconds total per file)


def midi_to_freq(midi_note: float) -> float:
    """Convert a MIDI pitch value (with decimal cents) to Hz."""
    return 440.0 * (2.0 ** ((midi_note - 69.0) / 12.0))


def generate_tone(
    freq_hz: float, duration: float, sr: int = SAMPLE_RATE, detune_cents: float = 0.0
) -> np.ndarray:
    """Generates a smooth sine wave tone with realistic attack and release envelopes."""
    # Apply detuning shift in cents if specified
    freq_hz *= 2.0 ** (detune_cents / 1200.0)

    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Fundamental tone + slight 2nd harmonic for realistic timbre
    audio = 0.7 * np.sin(2 * np.pi * freq_hz * t) + 0.3 * np.sin(
        4 * np.pi * freq_hz * t
    )

    # Apply 50ms smooth envelope at start/end to prevent pop clicks
    envelope_len = int(0.05 * sr)
    envelope = np.ones_like(audio)
    envelope[:envelope_len] = np.linspace(0, 1, envelope_len)
    envelope[-envelope_len:] = np.linspace(1, 0, envelope_len)

    return audio * envelope


def build_audio_file(
    midi_notes: list[float], cents_offsets: list[float], output_filename: str
):
    audio_segments = []

    for midi, cents in zip(midi_notes, cents_offsets):
        freq = midi_to_freq(midi)
        segment = generate_tone(
            freq, duration=DURATION_PER_NOTE, detune_cents=cents
        )
        audio_segments.append(segment)

    full_audio = np.concatenate(audio_segments)

    # Normalize audio to 16-bit PCM WAV range
    max_val = np.max(np.abs(full_audio))
    if max_val > 0:
        full_audio = full_audio / max_val
    audio_int16 = (full_audio * 32767).astype(np.int16)

    os.makedirs("audio_samples", exist_ok=True)
    out_path = os.path.join("audio_samples", output_filename)
    wavfile.write(out_path, SAMPLE_RATE, audio_int16)
    print(f"Generated sample file: {out_path}")


if __name__ == "__main__":
    # C Major Scale MIDI numbers: C4(60), D4(62), E4(64), F4(65), G4(67), A4(69), B4(71), C5(72)
    c_major = [60, 62, 64, 65, 67, 69, 71, 72]

    # 1. Perfectly Clean Scale
    build_audio_file(c_major, [0.0] * len(c_major), "scale_clean.wav")

    # 2. Intentionally Flat Scale (-30 cents off pitch across the board)
    build_audio_file(c_major, [-30.0] * len(c_major), "scale_flat.wav")

    # 3. Off-pitch Scale with mixed mistakes (+40 cents, -20 cents, and a wrong note)
    off_pitch_notes = [60, 62, 63, 65, 67, 70, 71, 72]  # Wrong notes at index 2 & 5
    off_pitch_cents = [0.0, 15.0, -35.0, 5.0, -25.0, 40.0, -10.0, 0.0]
    build_audio_file(off_pitch_notes, off_pitch_cents, "scale_wobbly.wav")