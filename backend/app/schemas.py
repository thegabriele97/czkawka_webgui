from typing import Any, Literal

from pydantic import BaseModel

Tool = Literal["duplicates", "similar_images", "similar_videos", "bad_extensions"]
Category = Tool
OpType = Literal["delete", "hardlink"]


class ScanCreate(BaseModel):
    tool: Tool
    directories: list[str]
    reference_directories: list[str] = []
    min_size: int = 0
    max_size: int | None = None
    max_difference: int = 5
    tolerance: int = 10


class ScanOut(BaseModel):
    id: int
    tool: str
    status: str
    progress_label: str | None = None
    progress_all: int | None = None
    result: Any | None = None
    error_message: str | None = None


class OperationCreate(BaseModel):
    category: Category
    op_type: OpType
    src_path: str
    dst_path: str | None = None


class OperationOut(BaseModel):
    id: int
    category: str
    op_type: str
    src_path: str
    dst_path: str | None = None
    status: str
    error_message: str | None = None


class OperationCounts(BaseModel):
    counts: dict[str, int]


class BrowseEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
