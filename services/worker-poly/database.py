import os
import json
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL) if DATABASE_URL else None

def save_analysis_to_db(session_id: str, metrics: dict):
    if not engine:
        print("WARNING: DATABASE_URL not set. Skipping database persistence.")
        return

    try:
        with engine.begin() as connection:
            # Extract polyphonic metrics matching your schema.sql columns
            overall_score = metrics.get("overall_score", 0.0)
            avg_cents_error = metrics.get("avg_cents_error", 0.0)  # Default for polyphonic tracks
            
            extracted_notes = {
                "total_notes_found": metrics.get("total_notes_found", 0),
                "tempo_bpm": metrics.get("tempo_bpm", 0.0),
                "sample_notes": metrics.get("sample_notes", [])
            }
            timing_alignment = metrics.get("timing_alignment", {})

            # 1. Insert into your master analysis_results table
            query = text("""
                INSERT INTO analysis_results (session_id, overall_score, avg_cents_error, extracted_notes, timing_alignment)
                VALUES (:session_id, :overall_score, :avg_cents_error, :extracted_notes, :timing_alignment)
                ON CONFLICT (session_id) DO UPDATE SET
                    overall_score = EXCLUDED.overall_score,
                    avg_cents_error = EXCLUDED.avg_cents_error,
                    extracted_notes = EXCLUDED.extracted_notes,
                    timing_alignment = EXCLUDED.timing_alignment
            """)
            
            connection.execute(query, {
                "session_id": session_id,
                "overall_score": overall_score,
                "avg_cents_error": avg_cents_error,
                "extracted_notes": json.dumps(extracted_notes),
                "timing_alignment": json.dumps(timing_alignment)
            })

            # 2. Update practice_sessions status to 'completed'
            update_session = text("""
                UPDATE practice_sessions SET status = 'completed' WHERE id = :session_id
            """)
            connection.execute(update_session, {"session_id": session_id})
            
            print(f"Successfully saved polyphonic analysis results for session {session_id} to PostgreSQL.")
    except Exception as e:
        print(f"Database persistence error: {str(e)}")
        raise 