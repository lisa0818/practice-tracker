import os
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://postgres:PracticeTracker2026@localhost:5432/practice_tracker"
engine = create_engine(DATABASE_URL)

def insert_seed_data():
    with engine.begin() as conn:
        # 1. Insert a dummy user
        conn.execute(text("""
            INSERT INTO users (id, email, hashed_password, full_name, role)
            VALUES ('a0000000-0000-0000-0000-000000000001', 'test@example.com', 'dummy_hash', 'Test User', 'student')
            ON CONFLICT (id) DO NOTHING;
        """))
        
        # 2. Insert the mono test session
        conn.execute(text("""
            INSERT INTO practice_sessions (id, user_id, title, target_scale, audio_gcs_path, status)
            VALUES ('162347ee-ed13-443b-be10-20c8d8aaaae3', 'a0000000-0000-0000-0000-000000000001', 'Ivory and Air Practice', 'C Major', 'uploads/mono/162347ee-ed13-443b-be10-20c8d8aaaae3/Ivory_and_Air.mp3', 'pending')
            ON CONFLICT (id) DO NOTHING;
        """))

        # 3. Insert the new polyphonic/piano test session
        conn.execute(text("""
            INSERT INTO practice_sessions (id, user_id, title, target_scale, audio_gcs_path, status)
            VALUES ('222e4567-e89b-12d3-a456-426614174222', 'a0000000-0000-0000-0000-000000000001', 'Piano Chord Practice', 'C Major', 'uploads/poly/222e4567-e89b-12d3-a456-426614174222/test_piano.wav', 'pending')
            ON CONFLICT (id) DO NOTHING;
        """))
        
    print("All seed data inserted successfully!")

if __name__ == "__main__":
    insert_seed_data()