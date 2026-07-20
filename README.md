# Czkawka Web GUI

[![CI/CD](https://github.com/thegabriele97/czkawka_webgui/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/thegabriele97/czkawka_webgui/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A self-hosted web GUI for [**czkawka**](https://github.com/qarmin/czkawka), the duplicate/junk-file finder — so it
can run headless on a server, NAS, or home lab and be driven from any browser, desktop or mobile, instead of needing
a local desktop session.

Single user, no login, no external job queue. Point it at a folder, scan, review results side by side with a live
preview, and queue up deletes/hardlinks to apply in one batch — everything czkawka_gui does, minus the requirement
that you're sitting in front of the machine that has the files.

## Features

- **Duplicates**, **Similar Images**, **Similar Videos**, and **Bad Extensions** — the same four scan types as
  czkawka_gui, with the same advanced options (hash size/algorithm, resize algorithm, crop detection, tolerance,
  ignore-same-size, ...), persisted per tool so you don't re-enter them every time.
- **Reference folders**: mark a folder as an untouchable reference, same as upstream — matches are only reported
  (and only ever deleted/hardlinked) from the non-reference folders.
- **Runs scans in the background** — start a scan, close the tab, come back from a different device, and it's
  still there: progress, results, and the shared folder selection are all stored server-side, not in the browser.
- **Stop a scan without losing work.** Stopping asks czkawka's underlying engine to wind down gracefully instead of
  killing it outright, so the hash cache it already built up for that scan is preserved instead of thrown away.
- **Side-by-side preview** with keyboard navigation (arrow keys move through results; a sticky panel on desktop,
  a fixed bottom sheet on mobile) so you can review large result sets without constant scrolling.
- **Batch delete/hardlink queue** — review and queue up decisions across a whole scan, then apply them all at once;
  a failure on one file doesn't abort the rest of the batch.

## Architecture

Three pieces, working together:

```
frontend (React/TS)  ──HTTP──>  backend (FastAPI/Python)  ──subprocess──>  bridge (Rust)  ──>  czkawka_core
```

- **`bridge/`** — a small Rust CLI built directly on top of `czkawka_core` (the actual engine behind czkawka_gui/
  czkawka_cli), streaming scan progress and results as newline-delimited JSON.
- **`backend/`** — a FastAPI app that owns the database (SQLite), spawns bridge subprocesses per scan, tracks
  progress, and exposes a REST API. No Celery/Redis — this is intentionally a small, single-user app.
- **`frontend/`** — a React + TypeScript SPA (Vite), talking only to the backend's REST API.

A full architecture write-up (protocol details, data model, known gotchas, etc.) lives in [`CLAUDE.md`](CLAUDE.md)
for anyone digging into the internals or extending the project.

## Quick start (Docker Compose)

```bash
git clone https://github.com/thegabriele97/czkawka_webgui.git
cd czkawka_webgui
docker compose up --build
```

This builds and starts both services:

- Frontend at `http://localhost:5173`
- Backend API at `http://localhost:8000`

By default `./data` is mounted into the backend container — put (or symlink) whatever you want to scan under
there, or edit the volume in `docker-compose.yml` to point somewhere else. Everything scannable/deletable must live
under that mount; the backend refuses to touch anything outside it.

## Running prebuilt images (Portainer / plain Compose)

Every push to `main` publishes fresh images to GHCR. To run those directly instead of building from source:

```yaml
services:
  backend:
    image: ghcr.io/thegabriele97/czkawka_webgui-backend:latest
    ports:
      - "8000:8000"
    volumes:
      - /path/to/your/library:/data
      - backend_db:/db
      - bridge_cache:/cache
    restart: unless-stopped

  frontend:
    image: ghcr.io/thegabriele97/czkawka_webgui-frontend:latest
    ports:
      - "5173:5173"
    environment:
      BACKEND_URL: http://backend:8000
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  backend_db:
  bridge_cache:
```

Paste this as a Portainer stack (adjusting the bind mount), or save it as `docker-compose.yml` and run
`docker compose up -d`. Only the `backend` needs a persistent data volume for the library itself — `backend_db`
(scan history/settings) and `bridge_cache` (czkawka's hash cache, so re-scans are fast) should also persist across
restarts; don't wipe those volumes unless you're fine losing scan history and re-hashing everything from scratch.

## Configuration

| Variable              | Default                          | Meaning                                                      |
| ---------------------- | --------------------------------- | -------------------------------------------------------------- |
| `DATA_ROOT`            | `/data`                          | Sandbox root — nothing outside this path is reachable.        |
| `BRIDGE_BIN`           | `/usr/local/bin/czkawka-bridge`  | Path to the bridge binary (set automatically in the Docker image). |
| `DATABASE_PATH`        | `/db/app.db`                     | SQLite database file location.                                |
| `CZKAWKA_CACHE_PATH`   | `/cache`                         | Where czkawka's hash/prehash cache is persisted between scans. |
| `CZKAWKA_CONFIG_PATH`  | `/cache`                         | czkawka's own config directory.                                |

## Development

Requires Rust (stable), Python 3.12+, and Node 22+.

```bash
# Bridge
cd bridge && cargo build --release && cargo test --release

# Backend (needs the bridge binary built above, and ffmpeg on PATH)
cd backend
pip install -r requirements-dev.txt
TEST_BRIDGE_BIN=../bridge/target/release/czkawka-bridge pytest -q

# Frontend
cd frontend
npm install
npm run build   # type-checks and builds
npm run dev     # dev server
```

CI runs all three test suites on every push/PR to `main`, then builds and publishes Docker images to GHCR on merge.
[Dependabot](.github/dependabot.yml) keeps the bridge's Rust dependencies (including `czkawka_core` itself) up to
date automatically, with the full CI suite running against every bump PR.

## Credits

Built entirely on top of [czkawka](https://github.com/qarmin/czkawka) by [Rafał Mikrut](https://github.com/qarmin)
and contributors — this project is just a web front end and orchestration layer around `czkawka_core`; all the
actual duplicate/similarity-detection engine is theirs.

## License

[MIT](LICENSE)
