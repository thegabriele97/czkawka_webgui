import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import FolderSelection
from ..schemas import FolderSelectionOut

router = APIRouter(prefix="/api/folders", tags=["folders"])

_ROW_ID = 1


@router.get("", response_model=FolderSelectionOut)
def get_folders(db: Session = Depends(get_db)):
    row = db.get(FolderSelection, _ROW_ID)
    return FolderSelectionOut(folders=json.loads(row.folders) if row else [])


@router.put("", response_model=FolderSelectionOut)
def set_folders(payload: FolderSelectionOut, db: Session = Depends(get_db)):
    row = db.get(FolderSelection, _ROW_ID)
    if row is None:
        row = FolderSelection(id=_ROW_ID)
        db.add(row)
    row.folders = json.dumps([f.model_dump() for f in payload.folders])
    db.commit()
    return payload
