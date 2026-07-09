from pathlib import Path

from fastapi import HTTPException

from .config import DATA_ROOT


def resolve_under_data_root(path_str: str) -> Path:
    """Resolves a path (absolute, or relative to DATA_ROOT) and rejects it
    if it escapes DATA_ROOT. Every endpoint that touches the filesystem
    (browse, scans, operations, media) goes through this so a stray `..`
    can never reach outside the mounted data folder.
    """
    raw = Path(path_str)
    candidate = (raw if raw.is_absolute() else DATA_ROOT / raw).resolve()
    if candidate != DATA_ROOT and DATA_ROOT not in candidate.parents:
        raise HTTPException(status_code=400, detail="path escapes the mounted data root")
    return candidate
