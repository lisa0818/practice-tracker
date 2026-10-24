import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import torch
import torchcrepe


def extract_pitch(
    audio_path: str,
    hop_length_ms: int = 10,
    confidence_threshold: float = 0.85,
    model_size: str = "tiny",
) -> list[dict]:
    """Extracts frame-by-frame pitch contours using torchcrepe on CPU."""
    audio, sr = librosa_load_16k(audio_path)
    audio_tensor = torch.from_numpy(audio).unsqueeze(0)
    hop_length = int(sr * (hop_length_ms / 1000.0))

    # Run CREPE with Viterbi decoder directly passed to predict
    pitch, confidence = torchcrepe.predict(
        audio_tensor,
        sample_rate=sr,
        hop_length=hop_length,
        fmin=50.0,
        fmax=2000.0,
        model=model_size,
        batch_size=2048,
        device="cpu",
        return_periodicity=True,
        decoder=torchcrepe.decode.viterbi,
    )

    # Median filter smoothing over a 3-frame window
    pitch = torchcrepe.filter.median(pitch, 3)

    pitch = pitch.squeeze(0).cpu().numpy()
    confidence = confidence.squeeze(0).cpu().numpy()

    frames = []
    for idx, (f0, conf) in enumerate(zip(pitch, confidence)):
        time_s = (idx * hop_length) / float(sr)

        if conf < confidence_threshold or f0 <= 0 or np.isnan(f0):
            continue

        midi_exact = 69.0 + 12.0 * math.log2(f0 / 440.0)
        midi_nearest = int(round(midi_exact))
        cents_error = (midi_exact - midi_nearest) * 100.0

        frames.append(
            {
                "time_s": round(time_s, 3),
                "f0_hz": round(float(f0), 2),
                "midi": midi_nearest,
                "cents_error": round(float(cents_error), 2),
                "confidence": round(float(conf), 3),
            }
        )

    return frames


def librosa_load_16k(path: str):
    import librosa

    audio, _ = librosa.load(path, sr=16000, mono=True)
    return audio, 16000


if __name__ == "__main__":
    sample_file = (
        sys.argv[1] if len(sys.argv) > 1 else "audio_samples/scale_clean.wav"
    )
    print(f"Analyzing pitch for: {sample_file}")
    extracted_frames = extract_pitch(sample_file)
    print(f"Extracted {len(extracted_frames)} valid pitch frames.")
    if extracted_frames:
        print("Sample frame:", extracted_frames[0])