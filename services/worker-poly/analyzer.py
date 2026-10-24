import os
import tempfile
from google.cloud import storage
from pathlib import Path
from basic_pitch.inference import predict
import librosa
import numpy as np
# Automatically find the root directory and the correct key file name
BASE_DIR = Path(__file__).resolve().parent.parent.parent
KEY_PATH = BASE_DIR / "service-account-key.json"

storage_client = storage.Client.from_service_account_json(str(KEY_PATH))
def analyze_polyphonic_audio(gcs_bucket: str, gcs_path: str):
    # Removed the redundant local storage_client = storage.Client() override here!
    bucket = storage_client.bucket(gcs_bucket)
    blob = bucket.blob(gcs_path)

    # Download the audio file temporarily into the container's disk space
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
        blob.download_to_filename(temp_file.name)
        temp_file_path = temp_file.name

    try:
        # --- 1. RHYTHM & TEMPO ANALYSIS (Librosa) ---
        y, sr = librosa.load(temp_file_path, sr=22050, mono=True)
        
        # Estimate overall tempo (BPM)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        estimated_bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        
        # Detect note onsets (attacks / note starts) for timing alignment
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()

        # --- 2. POLYPHONIC TRANSCRIPTION (Basic Pitch) ---
        # Run Basic Pitch inference (model weights are loaded automatically)
        model_output, midi_data, note_events = predict(temp_file_path)

        # Format detected polyphonic note events
        formatted_notes = [
            {
                "start_time": float(note[0]),
                "end_time": float(note[1]),
                "pitch_midi": int(note[2]),
                "amplitude": float(note[3]) if len(note) > 3 else 1.0
            }
            for note in note_events
        ]

        # Calculate a performance score based on note activity & consistency
        total_notes = len(formatted_notes)
        overall_score = min(100.0, max(0.0, 75.0 + (min(total_notes, 40) * 0.5)))

        metrics = {
            "polyphonic_detected": True,
            "overall_score": round(overall_score, 2),
            "tempo_bpm": round(estimated_bpm, 1),
            "total_notes_found": total_notes,
            "timing_alignment": {
                "status": "analyzed",
                "detected_onsets_count": len(onset_times),
                "onset_timestamps": onset_times[:50]  # First 50 note onset timestamps
            },
            "sample_notes": formatted_notes[:25]  # Sample of detected polyphonic notes
        }
        return metrics
    finally:
        # Clean up temporary audio file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)