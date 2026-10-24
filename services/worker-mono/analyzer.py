import os
import subprocess
from google.cloud import storage
import google.auth
import librosa
import torch
import torchcrepe
import numpy as np
import tempfile

# Navigate from services/worker-mono/ up two levels to the project root folder
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
key_path = os.path.join(root_dir, "service-account-key.json")

# Initialize storage client safely using core google.auth file loader
if os.path.exists(key_path):
    credentials, project_id = google.auth.load_credentials_from_file(key_path)
    storage_client = storage.Client(credentials=credentials, project=project_id)
else:
    # Fallback for production/Docker environments (like Cloud Run where ADC is automatic)
    storage_client = storage.Client()

def analyze_audio_file(bucket_name: str, gcs_path: str):
    # Reuse the globally initialized storage_client with loaded credentials
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)

    # Cross-platform temporary paths (works on Windows & Linux/Cloud Run)
    temp_dir = tempfile.gettempdir()
    raw_local_path = os.path.join(temp_dir, "raw_downloaded_audio.bin")
    wav_local_path = os.path.join(temp_dir, "standardized_audio.wav")

    try:
        blob.download_to_filename(raw_local_path)
        
        file_size = os.path.exists(raw_local_path) and os.path.getsize(raw_local_path) or 0
        print(f"DEBUG: Downloaded {gcs_path}, local size: {file_size} bytes")

        if file_size == 0:
            raise ValueError(f"The downloaded file '{gcs_path}' is completely empty (0 bytes).")

        # Convert audio format into clean PCM WAV using ffmpeg
        subprocess.run([
            "ffmpeg", "-y", "-i", raw_local_path,
            "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", wav_local_path
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        # Load audio using librosa
        y, sr = librosa.load(wav_local_path, sr=22050, mono=True)

        # --- 1. RHYTHM & TEMPO ANALYSIS ---
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        estimated_bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()

        # --- 2. PITCH ANALYSIS (Torchcrepe) ---
        hop_length = 220  # 10ms hops at 22.05kHz
        
        # Create standard PyTorch tensor directly (batch, samples)
        audio_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(0)
        
        pitches, periodicity = torchcrepe.predict(
            audio_tensor,
            sr,
            hop_length,
            fmin=50.0,
            fmax=2000.0,
            model="tiny",
            batch_size=2048,
            device="cpu",
            return_periodicity=True
        )

        pitches_np = pitches.squeeze(0).cpu().numpy()
        periodicity_np = periodicity.squeeze(0).cpu().numpy()
        
        valid_pitches = pitches_np[periodicity_np > 0.5]
        avg_pitch = float(np.mean(valid_pitches)) if len(valid_pitches) > 0 else 0.0

        # Calculate a dynamic score based on pitch stability
        pitch_stability = float(np.std(valid_pitches)) if len(valid_pitches) > 0 else 50.0
        overall_score = max(0.0, min(100.0, 100.0 - (pitch_stability * 0.5)))

        metrics = {
            "overall_score": round(overall_score, 2),
            "tempo_bpm": round(estimated_bpm, 1),
            "extracted_notes": {
                "average_pitch": round(avg_pitch, 2),
                "total_frames": len(pitches_np),
                "detected_onsets_count": len(onset_times),
            },
            "timing_alignment": {
                "status": "analyzed",
                "onset_timestamps": onset_times[:50]
            }
        }
        return metrics
    finally:
        for path in [raw_local_path, wav_local_path]:
            if os.path.exists(path):
                os.remove(path)