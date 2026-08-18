from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bridge
from ..db import get_db
from ..models import PendingOperation
from ..paths import resolve_under_data_root
from ..schemas import OperationCounts, OperationCreate, OperationOut

router = APIRouter(prefix="/api/operations", tags=["operations"])


def _to_out(op: PendingOperation) -> OperationOut:
    return OperationOut(
        id=op.id,
        category=op.category,
        op_type=op.op_type,
        src_path=op.src_path,
        dst_path=op.dst_path,
        status=op.status,
        error_message=op.error_message,
    )


@router.get("/counts", response_model=OperationCounts)
def get_counts(db: Session = Depends(get_db)):
    rows = db.query(PendingOperation.category).filter(PendingOperation.status == "pending").all()
    counts: dict[str, int] = {}
    for (category,) in rows:
        counts[category] = counts.get(category, 0) + 1
    return OperationCounts(counts=counts)


@router.get("", response_model=list[OperationOut])
def list_operations(category: str, db: Session = Depends(get_db)):
    """Lists the operations still awaiting a decision. Once applied, an
    operation's outcome was already shown in the apply report, so it drops
    out of this listing rather than lingering as a stale, already-resolved
    queue entry.
    """
    ops = (
        db.query(PendingOperation)
        .filter(PendingOperation.category == category, PendingOperation.status == "pending")
        .order_by(PendingOperation.created_at)
        .all()
    )
    return [_to_out(op) for op in ops]


@router.post("", response_model=OperationOut)
def create_operation(payload: OperationCreate, db: Session = Depends(get_db)):
    if payload.op_type in ("hardlink", "rename") and not payload.dst_path:
        raise HTTPException(status_code=400, detail=f"{payload.op_type} operations require dst_path")

    src = resolve_under_data_root(payload.src_path)
    dst = resolve_under_data_root(payload.dst_path) if payload.dst_path else None

    op = PendingOperation(
        category=payload.category,
        op_type=payload.op_type,
        src_path=str(src),
        dst_path=str(dst) if dst else None,
        status="pending",
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return _to_out(op)


@router.delete("/{operation_id}")
def delete_operation(operation_id: int, db: Session = Depends(get_db)):
    op = db.get(PendingOperation, operation_id)
    if op is None:
        raise HTTPException(status_code=404, detail="operation not found")
    if op.status != "pending":
        raise HTTPException(status_code=400, detail="only pending operations can be removed")
    db.delete(op)
    db.commit()
    return {"ok": True}


@router.post("/apply", response_model=list[OperationOut])
def apply_operations(category: str, db: Session = Depends(get_db)):
    """Runs every pending operation in `category` in order. Best-effort: a
    failure (e.g. a file moved externally, a cross-device hardlink) marks
    that operation `failed` with its error message and moves on to the
    next one, rather than aborting the whole batch.
    """
    ops = (
        db.query(PendingOperation)
        .filter(PendingOperation.category == category, PendingOperation.status == "pending")
        .order_by(PendingOperation.created_at)
        .all()
    )
    for op in ops:
        try:
            bridge.run_action(op.op_type, op.src_path, op.dst_path)
            op.status = "done"
            op.error_message = None
        except RuntimeError as e:
            op.status = "failed"
            op.error_message = str(e)
        op.applied_at = datetime.now(timezone.utc)
        db.commit()
    return [_to_out(op) for op in ops]
