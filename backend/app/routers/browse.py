from fastapi import APIRouter, HTTPException, Query

from ..paths import resolve_under_data_root
from ..schemas import BrowseEntry

router = APIRouter(prefix="/api/browse", tags=["browse"])


@router.get("", response_model=list[BrowseEntry])
def browse(path: str = Query("")):
    target = resolve_under_data_root(path)
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="directory not found")

    entries = []
    for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        entries.append(BrowseEntry(name=child.name, path=str(child), is_dir=child.is_dir()))
    return entries
