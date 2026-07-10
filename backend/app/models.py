from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tool: Mapped[str] = mapped_column(String, nullable=False)
    directories: Mapped[str] = mapped_column(Text, nullable=False)  # JSON-encoded list[str]
    reference_directories: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # JSON-encoded list[str]
    options: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON-encoded dict
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending|running|done|error
    progress_label: Mapped[str | None] = mapped_column(String, nullable=True)
    progress_all: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ToolSettings(Base):
    """The scan options last used for a given tool, so the form can be
    pre-filled next time instead of the user re-entering them."""

    __tablename__ = "tool_settings"

    tool: Mapped[str] = mapped_column(String, primary_key=True)
    options: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON-encoded dict


class PendingOperation(Base):
    __tablename__ = "pending_operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String, nullable=False)  # duplicates|similar_images|similar_videos|bad_extensions
    op_type: Mapped[str] = mapped_column(String, nullable=False)  # delete|hardlink
    src_path: Mapped[str] = mapped_column(String, nullable=False)
    dst_path: Mapped[str | None] = mapped_column(String, nullable=True)  # only for hardlink
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending|done|failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
