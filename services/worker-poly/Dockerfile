FROM python:3.10-slim

# Install system dependencies required for audio processing (libsndfile1 and ffmpeg)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .

# Upgrade pip first to resolve hash/dependency bugs, then install with an extended timeout
RUN pip install --upgrade pip
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Cloud Run defaults to 8080)
ENV PORT=8080
EXPOSE 8080

# Run FastAPI with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]