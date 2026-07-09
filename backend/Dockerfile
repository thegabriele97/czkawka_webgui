# Build context is the repo root (see docker-compose.yml) so this stage can
# reach the bridge/ crate, which lives alongside backend/, not inside it.

FROM rust:1-bookworm AS bridge-builder
WORKDIR /bridge
COPY bridge/Cargo.toml bridge/Cargo.lock* ./
COPY bridge/src ./src
RUN cargo build --release

FROM python:3.12-slim
# similar-videos scanning shells out to ffmpeg for frame extraction.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=bridge-builder /bridge/target/release/czkawka-bridge /usr/local/bin/czkawka-bridge

# These paths match the volume mounts declared in docker-compose.yml.
ENV DATA_ROOT=/data \
    BRIDGE_BIN=/usr/local/bin/czkawka-bridge \
    DATABASE_PATH=/db/app.db \
    CZKAWKA_CACHE_PATH=/cache \
    CZKAWKA_CONFIG_PATH=/cache

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
