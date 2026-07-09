import json
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bridge
from ..db import SessionLocal, get_db
from ..models import Scan
from ..paths import resolve_under_data_root
from ..schemas import ScanCreate, ScanOut

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _to_out(scan: Scan) -> ScanOut:
    return ScanOut(
        id=scan.id,
        tool=scan.tool,
        status=scan.status,
        progress_label=scan.progress_label,
        progress_all=scan.progress_all,
        result=json.loads(scan.result) if scan.result else None,
        error_message=scan.error_message,
    )


def _options_dict(payload: ScanCreate) -> dict:
    return {
        "min_size": payload.min_size,
        "max_size": payload.max_size,
        "max_difference": payload.max_difference,
        "tolerance": payload.tolerance,
    }


@router.post("", response_model=ScanOut)
def create_scan(payload: ScanCreate, db: Session = Depends(get_db)):
    directories = [str(resolve_under_data_root(d)) for d in payload.directories]
    reference_directories = [str(resolve_under_data_root(d)) for d in payload.reference_directories]

    scan = Scan(
        tool=payload.tool,
        directories=json.dumps(directories),
        reference_directories=json.dumps(reference_directories),
        options=json.dumps(_options_dict(payload)),
        status="running",
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    thread = threading.Thread(
        target=_run_scan_in_background,
        args=(scan.id, payload.tool, directories, reference_directories, _options_dict(payload)),
        daemon=True,
    )
    thread.start()

    return _to_out(scan)


def _run_scan_in_background(scan_id: int, tool: str, directories: list[str], reference_directories: list[str], options: dict):
    db = SessionLocal()
    try:
        def on_progress(label: str, all_progress: int):
            scan = db.get(Scan, scan_id)
            scan.progress_label = label
            scan.progress_all = all_progress
            db.commit()

        try:
            result = bridge.run_scan(tool, directories, reference_directories, options, on_progress)
        except RuntimeError as e:
            scan = db.get(Scan, scan_id)
            scan.status = "error"
            scan.error_message = str(e)
            scan.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        scan = db.get(Scan, scan_id)
        scan.status = "done"
        scan.result = json.dumps(result)
        scan.finished_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="scan not found")
    return _to_out(scan)
