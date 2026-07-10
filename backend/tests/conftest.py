import importlib
import os
import sys
from pathlib import Path

import pytest

# The real, release-built bridge binary. Tests that need to observe genuine
# scan/action behavior point BRIDGE_BIN here instead of a stub, so they
# exercise the same contract the backend relies on in prod. Defaults to the
# repo-relative build output (works for a local checkout); CI overrides this
# with TEST_BRIDGE_BIN since it downloads the binary to its own workspace.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REAL_BRIDGE_BIN = os.environ.get("TEST_BRIDGE_BIN", str(REPO_ROOT / "bridge" / "target" / "release" / "czkawka-bridge"))


def _make_client(tmp_path, monkeypatch, bridge_bin: str):
    data_root = tmp_path / "data"
    data_root.mkdir()
    db_path = tmp_path / "db" / "app.db"
    cache_path = tmp_path / "cache"

    monkeypatch.setenv("DATA_ROOT", str(data_root))
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    monkeypatch.setenv("BRIDGE_BIN", bridge_bin)
    monkeypatch.setenv("CZKAWKA_CACHE_PATH", str(cache_path))
    monkeypatch.setenv("CZKAWKA_CONFIG_PATH", str(cache_path))

    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]

    from fastapi.testclient import TestClient

    main = importlib.import_module("app.main")
    return TestClient(main.app), data_root


@pytest.fixture()
def app_client(tmp_path, monkeypatch):
    """Spins up a fresh FastAPI app per test, isolated to its own DATA_ROOT
    and SQLite file under tmp_path, with modules re-imported so config
    picked up from env vars at import time is honored. BRIDGE_BIN points to
    a stub since these tests don't need to run a real scan/action.
    """
    client, data_root = _make_client(tmp_path, monkeypatch, "/bin/true")
    with client:
        yield client, data_root


@pytest.fixture()
def app_client_real_bridge(tmp_path, monkeypatch):
    """Same as `app_client`, but wired to the real compiled bridge binary
    for tests that need to observe genuine scan behavior end-to-end.
    """
    client, data_root = _make_client(tmp_path, monkeypatch, REAL_BRIDGE_BIN)
    with client:
        yield client, data_root


@pytest.fixture()
def app_client_slow_bridge(tmp_path, monkeypatch):
    """Same as `app_client`, but BRIDGE_BIN is a fake scan that sleeps for a
    while before ever producing output - long enough for a test to reliably
    stop it mid-flight instead of racing a real scan's completion. On
    SIGTERM it prints a `stopped` line and exits cleanly, mirroring the real
    bridge's own graceful-shutdown contract (see bridge/tests/scan_stop.rs
    for the Rust-side test that this fake stands in for here) - a plain
    `sleep` wouldn't do that, and this test is about the backend's handling
    of that contract, not czkawka_core's actual stop/cache behavior.
    """
    script = tmp_path / "slow-bridge.py"
    script.write_text(
        "#!/usr/bin/env python3\n"
        "import signal, sys, time\n"
        "def handle_term(signum, frame):\n"
        "    print('{\"type\": \"stopped\"}', flush=True)\n"
        "    sys.exit(0)\n"
        "signal.signal(signal.SIGTERM, handle_term)\n"
        "time.sleep(30)\n"
    )
    script.chmod(0o755)
    client, data_root = _make_client(tmp_path, monkeypatch, str(script))
    with client:
        yield client, data_root
