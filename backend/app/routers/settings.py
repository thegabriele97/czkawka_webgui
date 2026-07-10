import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ToolSettings
from ..schemas import Tool, ToolSettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/{tool}", response_model=ToolSettingsOut)
def get_tool_settings(tool: Tool, db: Session = Depends(get_db)):
    """The options last used to scan with this tool, so the frontend can
    pre-fill the form. Empty if the tool has never been scanned yet."""
    settings = db.get(ToolSettings, tool)
    return ToolSettingsOut(tool=tool, options=json.loads(settings.options) if settings else {})
