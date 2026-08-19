# Czkawka Web GUI

A self-hosted web GUI for [czkawka](https://github.com/qarmin/czkawka) (duplicate/junk file finder), so it can run
headless on a server/NAS and be driven from a browser (desktop or mobile) instead of needing a desktop session.
Single-user, no auth, no queue system — designed to be run behind whatever network boundary the user already trusts
(LAN, Tailscale, reverse proxy, etc.), not exposed to the open internet.

Owner: Gabriele La Greca (gabriele.lagreca@cubitlab.com). Repo: `git@github.com:thegabriele97/czkawka_webgui.git`.

## Architecture

Three components, one repo:

```
frontend (React/TS, Vite)  --HTTP-->  backend (FastAPI/Python)  --subprocess/NDJSON-->  bridge (Rust/clap)  --> czkawka_core
```

- **`bridge/`** — a thin Rust CLI (`czkawka-bridge`) wrapping `czkawka_core` directly (not the `czkawka_cli` binary).
  Each invocation runs one scan or one file action and streams newline-delimited JSON to stdout. This is the only
  component that talks to `czkawka_core`.
- **`backend/`** — FastAPI app. Owns the DB (SQLite via SQLAlchemy), spawns bridge subprocesses, tracks scan
  progress/results, and exposes a REST API to the frontend. No background job runner (Celery/etc.) — scans run in a
  plain daemon `threading.Thread` per request, matching the single-user scope.
- **`frontend/`** — React + TypeScript + Vite, no UI framework (hand-rolled CSS in `index.css`). Talks only to the
  backend's REST API, never to the bridge or filesystem directly.

### Why a Rust bridge instead of shelling out to `czkawka_cli`

`czkawka_core` is the actual engine; `czkawka_cli` is just one consumer of it. Writing our own thin CLI on top of
`czkawka_core` gives direct access to the `Search` trait, the stop-flag (`AtomicBool`) for graceful cancellation, and
`czkawka_core`'s own JSON serialization (`save_results_to_file_as_json`) — so the wire format follows upstream
directly instead of us reverse-engineering `czkawka_cli`'s human-oriented output.

### NDJSON protocol (bridge stdout → backend)

Defined by the `Envelope` enum in `bridge/src/output.rs` (`#[serde(tag = "type", rename_all = "snake_case")]`):

- `{"type":"progress", "label", "all_progress", "current_progress", "current_progress_size"}` — emitted continuously
  from a dedicated thread draining a `crossbeam-channel` fed by `czkawka_core`'s progress callback.
- `{"type":"messages", "messages", "warnings", "errors"}` — `czkawka_core`'s own `text_messages` (the files it had
  to skip and why: a corrupted video ffprobe choked on, an unreadable folder, a missing ffmpeg). Emitted on its own
  line **before** the final line, so a stopped scan still reports what it saw. Always emitted, even when empty.
- `{"type":"result", "data"}` — final result, only on success.
- `{"type":"error", "message"}` — final result, only on failure.
- `{"type":"stopped"}` — final result when the process wound down because of a stop request (see below). Mutually
  exclusive with `result`/`error`.

The backend (`backend/app/bridge.py::run_scan`) reads this stream line by line, calls `on_progress` for progress
lines, and raises `ScanStopped` or `RuntimeError` (or returns the parsed result) once the process exits.

## Scan lifecycle

1. `POST /api/scans` creates a `Scan` row (`status="running"`) and starts a background thread that shells out to
   `czkawka-bridge scan ...`, streaming progress into that row as it goes. The subprocess `Popen` handle is kept in
   an in-memory registry (`bridge._running_processes`, keyed by scan id) so it can be stopped later.
2. **Stopping a scan** (`POST /api/scans/{id}/stop`) sends `SIGTERM` to the bridge process. The bridge registers a
   SIGTERM handler (`signal_hook::flag::register`) at startup that flips the same `AtomicBool` stop flag
   `czkawka_core`'s own search loops already poll — so this is a **graceful** stop, not a kill: `czkawka_core` notices
   the flag, saves its hash/prehash cache for whatever was scanned so far (its own internal behavior, unconditional
   before returning), and only then exits, at which point the bridge emits `{"type":"stopped"}` instead of a result.
   If the process hasn't exited within `_GRACEFUL_STOP_TIMEOUT_SECONDS` (20s), a watchdog thread escalates to
   `SIGKILL`. **Do not "fix" this into a hard kill** — that was an earlier, discarded design; it throws away
   already-computed cache entries. See `git log --oneline` for `2c5b7b2`/`1c438c4` for the reasoning.
3. **Reattaching after a page reload / different device**: the frontend never assumes it's the only observer. On
   mount, each tool page calls `GET /api/scans/latest?tool=X` to pick up whatever scan (running, done, stopped, or
   errored) was last started for that tool, and polls `GET /api/scans/{id}` every second while `status == "running"`.
   This is why a scan started on one device shows up correctly mid-progress when opened from another.
4. **Startup sweep for orphaned scans**: if the backend process itself restarts (e.g. `docker compose up --build`)
   while a scan is running, the subprocess dies with it but the DB row is stuck at `status="running"` forever — no
   process is left to stop, so `POST .../stop` would 409 indefinitely. `scans.mark_interrupted_scans()`, called from
   FastAPI's `lifespan` on every startup, sweeps all `running` rows to `status="error"` with an explanatory message.
   This is a real bug that shipped once (see commit `766f8b9`) — don't remove this sweep.

Scan statuses: `pending` (unused today, scans go straight to `running`) → `running` → one of `done` / `error` /
`stopped`.

## Data model (`backend/app/models.py`)

- `Scan` — one row per scan run. `directories`/`reference_directories`/`options`/`result`/`messages` are JSON-encoded
  text columns (SQLite, no native JSON needs). `options` records exactly what was passed to the bridge for that run;
  `messages` is the bridge's `messages` line (skipped files/warnings), set for `done` **and** `stopped` scans.
- `ToolSettings` — one row per tool (`duplicates`/`similar_images`/`similar_videos`/`bad_extensions`), the
  last-used scan options, so the options form pre-fills instead of asking the user to re-enter them every time.
- `FolderSelection` — a **single-row** table (`id` fixed at 1) holding the one globally-shared folder list (path +
  is-reference flag per folder). Deliberately not per-session/per-device: the whole app follows czkawka_gui's model
  of one shared folder list feeding every tool tab, and it must look the same regardless of which device/browser has
  it open — this was a deliberate fix (commit `c290c2c`) away from an earlier `localStorage`-based design that broke
  cross-device use. **If you're tempted to reach for `localStorage` for any piece of app state, don't** — it was
  already tried and explicitly rejected for exactly this reason; anything that should look the same from another
  device belongs in the DB behind a small router, following this same single-row pattern.
- `PendingOperation` — a queued delete/hardlink/rename action (one row per file decision), applied in a batch later
  via `POST /api/operations/apply`. Deliberately best-effort per-row: one failure doesn't abort the batch.
  `rename` is Bad Extensions' "use the extension the content implies" fix; `dst_path` is the target path, required
  for `hardlink` and `rename` alike. The bridge refuses a rename whose target already exists rather than clobbering
  an unrelated file (`bridge/src/actions.rs::run_rename_cmd`) — there's no `czkawka_core` helper for renaming, so
  that guard is ours.

Schema changes: `db.py::_add_missing_columns()` runs after `create_all` on every startup and `ALTER TABLE ... ADD
COLUMN`s any **nullable** column a model declares but the table lacks. `create_all` only ever creates missing
*tables*, and the `backend_db` volume outlives rebuilds, so without this a newly added column (like `Scan.messages`)
would be missing forever on an already-deployed install. A NOT NULL column is deliberately skipped — that needs a
real backfill decision, not a silent ALTER.

## API surface (all under `/api`, see `backend/app/routers/`)

- `browse` — `GET /api/browse?path=` lists a directory under `DATA_ROOT` (folder picker backend).
- `scans` — `POST /api/scans`, `GET /api/scans/latest?tool=`, `GET /api/scans/{id}`, `POST /api/scans/{id}/stop`.
  Route order matters: `/latest` is registered before `/{scan_id}` so it isn't swallowed by the path param.
- `operations` — `GET /api/operations?category=`, `POST /api/operations`, `DELETE /api/operations/{id}`,
  `GET /api/operations/counts`, `POST /api/operations/apply?category=`.
- `media` — `GET /api/media?path=` (serves the raw file, range-request aware, for the preview overlay/video
  playback), `GET /api/media/thumbnail?path=` (ffmpeg single-frame JPEG extraction for video previews).
- `settings` — `GET /api/settings/{tool}` returns the persisted `ToolSettings` for that tool.
- `folders` — `GET /api/folders`, `PUT /api/folders` (the single-row shared folder list).
- `GET /api/config` — exposes `DATA_ROOT` so the frontend can strip the container mount prefix off displayed paths.

Every filesystem-touching endpoint resolves paths through `paths.resolve_under_data_root`, which rejects anything
that would escape `DATA_ROOT` (including via `..`) with a 400. This is the one and only path-safety boundary — don't
duplicate ad hoc path checks elsewhere, route through this function instead.

## Frontend structure

- `App.tsx` — top-level layout, nav (brand + tab links + theme toggle), and the shared `folders` state
  (fetched/saved via `api.getFolders`/`saveFolders`, no localStorage — see above).
- **Theme system** — two named themes, `daylight` (light) and `salvage` (dark), driven by `data-theme` on `<html>`.
  `index.css` defines the full Daylight palette on `:root` and overrides only the tokens under
  `:root[data-theme="salvage"]`; components read tokens only. `hooks/useTheme.ts` owns the ☀/☾ toggle and persists
  the choice in **localStorage** — a deliberate, owner-approved exception to the no-localStorage rule, because the
  theme is a per-device display preference, not shared app state (unlike folders). An inline script in `index.html`
  applies the saved/`prefers-color-scheme` theme before first paint to avoid a flash. Fonts are Archivo (UI) +
  JetBrains Mono (paths/sizes), loaded from Google Fonts in `index.html`.
- `pages/ToolScanPage.tsx` — shared page for Duplicates/Similar Images/Similar Videos (anything that produces
  comparable groups with delete/hardlink decisions). Owns: the (collapsible, `<details>`-based) scan options form,
  start/stop, reattach-on-mount, and keyboard/preview navigation.
- `pages/BadExtensionsPage.tsx` — separate, simpler page (flat list, not a compare-and-decide workflow), but mirrors
  `ToolScanPage`'s start/stop/reattach lifecycle independently. Its one action is queueing a `rename` to
  `proper_extension` (same folder, same base name, extension swapped) — it goes through the same
  `PendingOperation` queue as every other destructive action, so it also shows up in the nav badge and the Pending
  Queue page's category tabs.
- `components/ScanWarnings.tsx` — collapsed `<details>` listing the bridge's `messages` line (warnings + errors),
  shown on every tool page for `done`/`stopped` scans. Strips `DATA_ROOT` and the Unicode bidi isolates
  `czkawka_core` wraps every path in (they render as stray boxes). The informational `messages` array is
  deliberately not shown — it's mostly cache bookkeeping ("Properly saved to file N cache entries").
- `pages/DuplicatesPage.tsx` / `SimilarImagesPage.tsx` / `SimilarVideosPage.tsx` — thin wrappers that just supply a
  `ToolConfig` to `ToolScanPage`.
- `api/normalizeGroups.ts` — reshapes czkawka_core's per-tool JSON quirks (duplicates come back keyed by file size,
  each value itself a *list* of groups; similar-images/videos are already a flat array; either shape has "flat list"
  or "[reference, members[]]" group variants depending on whether a reference folder was used) into one uniform
  `Group[]`, and sorts everything by path since `czkawka_core` doesn't guarantee group/member order is stable between
  runs of the same folders.
- `api/navItems.ts` — flattens grouped results into one keyboard-navigable sequence with an explicit `gap` marker
  between groups (not after the last one), so ArrowUp/ArrowDown can pass through a deliberate "nothing selected"
  state at each group boundary instead of jumping straight from one group's last row to the next group's first row.
- `components/ResultsTable.tsx` — renders groups; keeps a `Map<path, HTMLElement>` ref registry and `scrollIntoView`s
  the selected row on selection change (keyboard or click). Renders a **desktop table** or, below 720px
  (`useMediaQuery`), a **mobile card list** (`Card`, `.results-cards`) with the same queue handlers — a phone never
  scrolls a wide multi-column table sideways. **Column auto-fit**: the metadata columns and Folder are measured to
  their widest actual value via a `<canvas>` (table cells don't report `scrollWidth` as content width, so measuring
  the DOM is unreliable — measuring the text is not); the file name takes the leftover. Manual drag-resize still wins
  per column. Each row carries a `MediaThumb` (click opens the overlay); a queued row gets a light green tint + edge
  stripe (`.queued`), and the hardlink action is a compact chain-link icon in the desktop table.
- `components/MediaThumb.tsx` — the results thumbnail (images direct, videos via `/api/media/thumbnail`, else a dash),
  with the REF / suggested-keep (★) markers **overlaid on the thumbnail corners** rather than inline before the name,
  so every file name in the column stays left-aligned. Clicking it opens `PreviewOverlay`.
- `components/ReclaimSummary.tsx` — the "estimated space to reclaim" strip above the results (headline number + meter
  + group/file counts). A labelled estimate: with a reference folder every member is freeable; without one it assumes
  the largest copy is kept.
- `components/PreviewPanel.tsx` (inline, sticky on desktop — its grid cell needs `.preview-column { align-self:
  stretch }`, since `.results-layout`'s `align-items: start` otherwise shrinks the cell to the panel's own height
  and a `position: sticky` element can never travel outside its cell, which made the preview scroll off-screen on
  long result lists; clicking the preview opens the overlay) vs `components/PreviewOverlay.tsx` (full overlay on
  thumbnail/preview click or row double-click, for actual playback). Mobile CSS switches the inline panel to
  `position: fixed` at the bottom (`@media (max-width: 720px)` in `index.css`) so it's reachable without scrolling
  past the whole results list.

## Advanced scan options

Similar Images: `max_difference`, `hash_size` (8/16/32/64), `hash_alg` (mean/median/gradient/vert-gradient/
double-gradient/blockhash), `resize_algorithm` (nearest/triangle/catmull-rom/gaussian/lanczos3), `ignore_same_size`.
These mirror czkawka_gui's own Similar Images options exactly.

Similar Videos: `tolerance` (max difference), `crop_detect` (bool), `skip_forward_amount`, `vid_hash_duration`,
`ignore_same_size`. Note `crop_detect` is a **checkbox**, not the three-way dropdown (`letterbox`/`motion`/`none`)
some czkawka_gui versions show — this isn't a gap in our implementation, upstream `czkawka_core` itself now exposes
only a boolean (`DEFAULT_CROP_DETECT` const) for this parameter; the three-way version was from an older upstream
release. If a future `czkawka_core` bump reintroduces a multi-value crop-detect param, this is the place to look
(`bridge/src/scan.rs::ScanArgs::crop_detect`, `SimilarVideosParameters::new`).

Both option sets round-trip through `ToolSettings` (last-used values persisted server-side, pre-filled into the form
on next visit) and are collapsed behind a `<details class="options-menu">` so the common path (just picking folders
and hitting scan) isn't cluttered.

`image_hasher`/`image` crate types (`HashAlg`, `FilterType`) can't derive `ValueEnum` directly since they're foreign
types — `bridge/src/scan.rs` wraps them in local `ImageHashAlg`/`ImageResizeAlgorithm` enums with `From` impls
instead. Follow the same pattern for any future upstream enum that needs to become a CLI flag.

## Known gotchas / non-obvious behavior

- **`minimal_cached_file_size: 257_144`** (257KB), hardcoded in `run_duplicates` (`bridge/src/scan.rs`): files
  smaller than this are never cached by czkawka_core regardless of how/when a scan stops. Don't be surprised if a
  stopped-scan cache-growth experiment on small files shows nothing — that's expected, not a bug.
  Not currently exposed as a CLI/UI option.
  Similar Images/Videos always use `czkawka_core`'s own defaults for this since it isn't exposed there either.
  Discovered while trying to empirically verify cache growth after a graceful stop; see `bridge/tests/scan_stop.rs`
  for the automated version of that proof (needs ~20,000 tiny files to make a scan slow enough to reliably catch
  mid-flight with SIGTERM — fewer files finishes before the signal lands).
- **`ffmpeg` background processes** you might see on the host are a mix of two independent sources: (1)
  `czkawka_core` itself shells out to `ffmpeg` internally during Similar Videos scans (frame sampling/hashing), and
  (2) our own `GET /api/media/thumbnail` endpoint (`backend/app/routers/media.py`) shells out to `ffmpeg` per-request
  to extract a single preview frame from a video. Neither is a leak by itself; if a **scan itself** looks stuck check
  `czkawka_core`'s own behavior, not our code.
- **Cross-thread `Popen.wait()`**: `bridge.py`'s stop-scan watchdog thread calls `process.wait(timeout=...)` while
  the main scan thread is also implicitly relying on `process.wait()` after the stdout loop ends. This is safe —
  CPython's subprocess module uses an internal lock making concurrent `.wait()` calls from multiple threads safe —
  but don't "simplify" this into a single-thread design without keeping that in mind, the two-thread structure is
  what lets the stop endpoint return immediately instead of blocking the request for up to 20s.

## Testing

- **Bridge** (`bridge/`): `cargo test --release` (integration tests spawn the real built binary via
  `assert_cmd`/`CARGO_BIN_EXE_czkawka-bridge`). `bridge/tests/scan_stop.rs` sends a real `SIGTERM` mid-scan and
  asserts a graceful `{"type":"stopped"}` line with no `result` line; `bridge/tests/rename.rs` covers the rename
  action, including its refusal to overwrite an existing target.
- **Backend** (`backend/`): `python -m pytest -q` (or bare `pytest -q` — `backend/pytest.ini` sets `pythonpath = .`
  so both work identically; this was a real CI break once, don't remove that file). Needs a real built bridge binary
  at `TEST_BRIDGE_BIN` (see `conftest.py`) plus `ffmpeg` on PATH for video-related tests. 37 tests as of the last
  session covering scans (including the czkawka messages payload), stop/reattach/startup-sweep, settings
  persistence, folders CRUD, operations (delete/hardlink/rename), browse, media.
  `conftest.py`'s `app_client_slow_bridge` fixture is a **Python script**, not a shell script — it needs a real
  `signal.signal(SIGTERM, ...)` handler to interrupt `time.sleep()` and emit the stopped line; a shell/`sleep`-based
  fake bridge can't participate in the graceful-stop protocol and also risks orphaning the stdout pipe if the
  child isn't `exec`'d.
- **Frontend** (`frontend/`): no unit test suite yet — `npm run build` runs `tsc --noEmit && vite build`, which is
  what CI treats as "passing." No browser automation is available in this environment; UI changes should be described
  to the user as type-checked/built but not visually click-tested unless stated otherwise.

CI (`.github/workflows/ci-cd.yml`) runs all three in parallel-ish stages on every push/PR to `main`
(`test-bridge` → `test-backend` depends on the bridge build artifact; `test-frontend` independent), then on a push to
`main` only, builds and pushes `backend`/`frontend` images to GHCR (`ghcr.io/<owner>/<repo>-backend`,
`...-frontend`, tagged `latest` and `<sha>`).

**Dependabot** (`.github/dependabot.yml`): weekly check of `bridge/Cargo.toml` (cargo ecosystem), covering
`czkawka_core` and the bridge's other direct deps (clap, serde, signal-hook, crossbeam-channel). Opens a PR per
outdated dependency; the existing `pull_request` CI trigger runs the full suite against it automatically, and GitHub
natively pulls upstream release notes into the PR body for dependencies whose repo has GitHub Releases. Scope is
deliberately limited to `cargo`/`bridge` only (that's what was asked for) — frontend (npm), backend (pip), and Docker
base images are not covered; ask before expanding rather than assuming wider coverage is wanted.

## Running locally

```
docker compose up --build
```

Builds `backend` (multi-stage: builds the bridge crate in a `rust:1-bookworm` stage, copies the binary into a
`python:3.12-slim` + `ffmpeg` final image) and `frontend` (Vite dev server), per `docker-compose.yml`. Mount
`./data` for whatever should be scannable — everything scan/hardlink-eligible must live under it, enforced by
`resolve_under_data_root`. Named volumes `backend_db` (SQLite) and `bridge_cache` (czkawka_core's hash cache) persist
across rebuilds — don't `docker compose down -v` casually, that throws away both the DB and every cached hash.

## Deploying (Portainer / GHCR images)

CI publishes prebuilt images on every push to `main`. A Portainer stack (or plain `docker compose`) can run those
directly instead of building from source:

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

GHCR images are public-pull by default for a public repo; if the repo is ever made private this needs a registry
login/pull secret in Portainer. Adjust the `/path/to/your/library` bind mount to whatever the host should expose.

## Configuration (env vars, see `backend/app/config.py`)

- `DATA_ROOT` (default `/data`) — the sandbox root every path is resolved against.
- `BRIDGE_BIN` (default `/usr/local/bin/czkawka-bridge`) — path to the bridge binary.
- `DATABASE_PATH` (default `/db/app.db`) — SQLite file location.
- `CZKAWKA_CACHE_PATH` / `CZKAWKA_CONFIG_PATH` (set in the backend Dockerfile, both `/cache`) — where
  `czkawka_core` persists its hash/prehash cache between runs; must be set before anything touches the cache
  (including the logger), or `czkawka_core` panics — see `bridge/src/main.rs::main`.

## Collaboration notes

- The user (Gabriele) writes to me in Italian, mixed with English technical terms; code, comments, and commit
  messages stay in English. Keep responses terse — this user reads diffs directly and doesn't want a restated
  summary of what changed after every turn beyond a short confirmation.
- Default to acting and pushing once a fix/feature is confirmed working (tests passing / build green) rather than
  asking for a second confirmation before commit+push, once the user has said e.g. "ok pusha" / "si pusha pure" for
  the current unit of work — but each *new* change still gets its own explicit go-ahead, don't chain unrelated
  pushes off one earlier "yes."
- Be explicit about the limits of what was actually verified in a given session (e.g. "type-checked and built, not
  visually tested" for UI work; "unit test passes, live cache-growth wasn't independently reproduced" for the
  graceful-stop feature) rather than implying full verification happened when it didn't.
- When the user reports one instance of a class of bug (e.g. "folders don't sync across devices"), treat it as the
  general principle ("*nothing* should be device-local state") rather than fixing only the literal instance
  mentioned — confirmed explicitly by the user for the folder-sync fix ("questo è solo un esempio che ho notato").

## Keeping this file current

This file is meant to save re-deriving architecture/history from scratch every session — when a future change
alters something described here (a new persisted-state table, a changed protocol field, a new gotcha discovered the
hard way), update the relevant section in the same commit/session rather than leaving it stale.
