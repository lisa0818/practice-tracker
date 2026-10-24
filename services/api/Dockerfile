FROM python:3.11-slim

WORKDIR /app

# Copy dependency list and install requirements
COPY requirements.txt .

RUN pip install --upgrade pip
# Increase timeout to 1000 seconds for large ML packages
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]