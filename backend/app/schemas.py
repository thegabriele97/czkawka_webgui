from typing import Any, Literal

from pydantic import BaseModel

Tool = Literal["duplicates", "similar_images", "similar_videos", "bad_extensions"]
Category = Tool
OpType = Literal["delete", "hardlink", "rename"]
HashAlg = Literal["mean", "median", "gradient", "vert-gradient", "double-gradient", "blockhash"]
ResizeAlgorithm = Literal["nearest", "triangle", "catmull-rom", "gaussian", "lanczos3"]
HashSize = Literal[8, 16, 32, 64]


class ScanCreate(BaseModel):
    tool: Tool
    directories: list[str]
    reference_directories: list[str] = []
    min_size: int = 0
    max_size: int | None = None
    # Similar images
    max_difference: int = 5
    ignore_same_size: bool = False
    hash_size: HashSize = 16
    hash_alg: HashAlg = "gradient"
    resize_algorithm: ResizeAlgorithm = "nearest"
    # Similar videos
    tolerance: int = 10
    crop_detect: bool = True
    skip_forward_amount: int = 15
    vid_hash_duration: int = 10


class ScanOut(BaseModel):
    id: int
    tool: str
    status: str
    reference_directories: list[str] = []
    progress_label: str | None = None
    progress_all: int | None = None
    result: Any | None = None
    messages: dict | None = None
    error_message: str | None = None


class OperationCreate(BaseModel):
    category: Category
    op_type: OpType
    src_path: str
    dst_path: str | None = None


class OperationBulkCreate(BaseModel):
    """A batch of decisions queued in one shot (e.g. "delete every duplicate
    except the one kept per group"). Same per-item shape as OperationCreate;
    the user then prunes individual rows before applying."""

    operations: list[OperationCreate]


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


class ToolSettingsOut(BaseModel):
    tool: str
    options: dict


class FolderSelectionEntry(BaseModel):
    path: str
    is_reference: bool


class FolderSelectionOut(BaseModel):
    folders: list[FolderSelectionEntry]
