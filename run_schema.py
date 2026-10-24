import os
from sqlalchemy import create_engine, text

# 1. Connect to the default system 'postgres' database first with AUTOCOMMIT
DEFAULT_URL = "postgresql://postgres:PracticeTracker2026@localhost:5432/postgres"
default_engine = create_engine(DEFAULT_URL, isolation_level="AUTOCOMMIT")

# 2. Automatically create 'practice_tracker' database if it doesn't exist
print("Checking if 'practice_tracker' database exists...")
with default_engine.connect() as conn:
    result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = 'practice_tracker'"))
    if not result.scalar():
        conn.execute(text("CREATE DATABASE practice_tracker"))
        print("Created database 'practice_tracker' successfully!")
    else:
        print("Database 'practice_tracker' already exists.")

# 3. Now connect to 'practice_tracker' and execute your schema.sql file
DATABASE_URL = "postgresql://postgres:PracticeTracker2026@localhost:5432/practice_tracker"
engine = create_engine(DATABASE_URL)

def execute_sql_file():
    schema_path = "infra/schema.sql"
    print(f"Reading {schema_path}...")
    
    with open(schema_path, "r", encoding="utf-8") as f:
        sql_script = f.read()

    print("Executing master schema against PostgreSQL...")
    with engine.begin() as connection:
        connection.execute(text(sql_script))
        
    print("Successfully initialized database using schema.sql!")

if __name__ == "__main__":
    execute_sql_file()