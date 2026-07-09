import os
from pathlib import Path

DATA_ROOT = Path(os.environ.get("DATA_ROOT", "/data")).resolve()
BRIDGE_BIN = os.environ.get("BRIDGE_BIN", "/usr/local/bin/czkawka-bridge")
DATABASE_PATH = os.environ.get("DATABASE_PATH", "/db/app.db")
