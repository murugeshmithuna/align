FROM python:3.12-slim

# libgl1/libglib2.0-0 - mediapipe's compiled graph runtime dlopens these even
# with the "headless" opencv build; missing them fails at import time, not at
# build time, so they're easy to skip by accident.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"]
