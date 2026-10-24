import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from notes import extract_notes_from_frames
from pitch import extract_pitch
from timing import align_and_score





def run_benchmark(audio_path: str, target_scale: list[int]):
    print(f"--- Starting CPU Benchmark for: {audio_path} ---")

    t0 = time.time()
    frames = extract_pitch(audio_path, model_size="tiny")
    t_pitch = time.time() - t0

    t1 = time.time()
    notes = extract_notes_from_frames(frames, audio_path)
    t_notes = time.time() - t1

    t2 = time.time()
    results = align_and_score(notes, target_scale)
    t_scoring = time.time() - t2

    total_time = t_pitch + t_notes + t_scoring

    print(f"\n[BENCHMARK RESULTS]")
    print(f"Pitch Extraction (CREPE CPU): {t_pitch:.2f}s")
    print(f"Note Segmentation (librosa):  {t_notes:.2f}s")
    print(f"DTW Scoring:                  {t_scoring:.4f}s")
    print(f"Total Processing Time:        {total_time:.2f}s")
    print(
        f"Overall Performance Score:    {results['overall_score']}% (Avg Cents Error: {results['avg_cents_error']})"
    )


if __name__ == "__main__":
    audio_file = sys.argv[1] if len(sys.argv) > 1 else "audio_samples/scale.wav"
    # C Major Scale MIDI numbers: C4, D4, E4, F4, G4, A4, B4, C5
    c_major_scale = [60, 62, 64, 65, 67, 69, 71, 72]

    run_benchmark(audio_file, c_major_scale)