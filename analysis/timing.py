import numpy as np
from scipy.spatial.distance import cdist


def align_and_score(
    detected_notes: list[dict], target_midi_sequence: list[int]
) -> dict:
    """Aligns detected performance notes to target reference pitches via DTW and computes timing/pitch metrics."""
    if not detected_notes or not target_midi_sequence:
        return {
            "overall_score": 0.0,
            "avg_timing_error_ms": 0.0,
            "avg_cents_error": 0.0,
            "aligned_notes": [],
        }

    detected_midis = np.array([n["midi"] for n in detected_notes]).reshape(-1, 1)
    target_midis = np.array(target_midi_sequence).reshape(-1, 1)

    # Cost matrix based on MIDI note distance
    cost_matrix = cdist(detected_midis, target_midis, metric="cityblock")

    # Fast local DTW alignment
    path = simple_dtw(cost_matrix)

    aligned_results = []
    timing_errors_ms = []
    cents_errors = []

    for d_idx, t_idx in path:
        det = detected_notes[d_idx]
        target_midi = target_midi_sequence[t_idx]

        pitch_correct = det["midi"] == target_midi
        cents_errors.append(abs(det["cents_error"]))

        aligned_results.append(
            {
                "detected_midi": det["midi"],
                "target_midi": target_midi,
                "onset_s": det["onset_s"],
                "cents_error": det["cents_error"],
                "in_tune": pitch_correct and abs(det["cents_error"]) <= 25.0,
            }
        )

    # Pitch score (% of notes within 25 cents of target pitch)
    in_tune_count = sum(1 for a in aligned_results if a["in_tune"])
    pitch_score = (
        (in_tune_count / len(aligned_results)) * 100.0 if aligned_results else 0.0
    )

    avg_cents = float(np.mean(cents_errors)) if cents_errors else 0.0

    return {
        "overall_score": round(pitch_score, 1),
        "avg_cents_error": round(avg_cents, 1),
        "total_notes_detected": len(detected_notes),
        "aligned_notes": aligned_results,
    }


def simple_dtw(cost_matrix):
    N, M = cost_matrix.shape
    accumulated_cost = np.zeros((N, M))
    accumulated_cost[0, 0] = cost_matrix[0, 0]

    for i in range(1, N):
        accumulated_cost[i, 0] = accumulated_cost[i - 1, 0] + cost_matrix[i, 0]
    for j in range(1, M):
        accumulated_cost[0, j] = accumulated_cost[0, j - 1] + cost_matrix[0, j]

    for i in range(1, N):
        for j in range(1, M):
            accumulated_cost[i, j] = cost_matrix[i, j] + min(
                accumulated_cost[i - 1, j],
                accumulated_cost[i, j - 1],
                accumulated_cost[i - 1, j - 1],
            )

    path = []
    i, j = N - 1, M - 1
    while i > 0 or j > 0:
        path.append((i, j))
        if i == 0:
            j -= 1
        elif j == 0:
            i -= 1
        else:
            step = np.argmin(
                [
                    accumulated_cost[i - 1, j],
                    accumulated_cost[i, j - 1],
                    accumulated_cost[i - 1, j - 1],
                ]
            )
            if step == 0:
                i -= 1
            elif step == 1:
                j -= 1
            else:
                i -= 1
                j -= 1
    path.append((0, 0))
    path.reverse()
    return path