import json
import subprocess
from typing import Callable

from .config import BRIDGE_BIN

TOOL_CLI_NAMES = {
    "duplicates": "duplicates",
    "similar_images": "similar-images",
    "similar_videos": "similar-videos",
    "bad_extensions": "bad-extensions",
}


def _build_scan_command(tool: str, directories: list[str], reference_directories: list[str], options: dict) -> list[str]:
    cmd = [BRIDGE_BIN, "scan", "--tool", TOOL_CLI_NAMES[tool]]
    for directory in directories:
        cmd += ["--dir", directory]
    for directory in reference_directories:
        cmd += ["--reference-dir", directory]
    if options.get("min_size") is not None:
        cmd += ["--min-size", str(options["min_size"])]
    if options.get("max_size") is not None:
        cmd += ["--max-size", str(options["max_size"])]
    if tool == "similar_images" and options.get("max_difference") is not None:
        cmd += ["--max-difference", str(options["max_difference"])]
    if tool == "similar_videos" and options.get("tolerance") is not None:
        cmd += ["--tolerance", str(options["tolerance"])]
    return cmd


def run_scan(
    tool: str,
    directories: list[str],
    reference_directories: list[str],
    options: dict,
    on_progress: Callable[[str, int], None],
):
    """Runs the bridge scan subprocess to completion, calling `on_progress`
    for every progress line, and returns the parsed final result payload.
    Raises RuntimeError with a human-readable message on failure.
    """
    cmd = _build_scan_command(tool, directories, reference_directories, options)
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert process.stdout is not None

    result = None
    error = None
    for raw_line in process.stdout:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        line_type = payload.get("type")
        if line_type == "progress":
            on_progress(payload.get("label", ""), payload.get("all_progress", -1))
        elif line_type == "result":
            result = payload.get("data")
        elif line_type == "error":
            error = payload.get("message", "unknown bridge error")

    process.wait()
    if error is not None or process.returncode != 0:
        stderr = process.stderr.read() if process.stderr else ""
        raise RuntimeError(error or stderr or f"bridge exited with code {process.returncode}")
    return result


def run_action(op_type: str, src_path: str, dst_path: str | None) -> None:
    """Runs a single hardlink/delete action via the bridge on one exact
    path (or path pair). Raises RuntimeError with a human-readable message
    on failure.
    """
    if op_type == "hardlink":
        if not dst_path:
            raise ValueError("hardlink operations require dst_path")
        cmd = [BRIDGE_BIN, "hardlink", src_path, dst_path]
    elif op_type == "delete":
        cmd = [BRIDGE_BIN, "delete", src_path, "--trash"]
    else:
        raise ValueError(f"unknown op_type: {op_type}")

    process = subprocess.run(cmd, capture_output=True, text=True)
    error = None
    for raw_line in process.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "error":
            error = payload.get("message")

    if error is not None or process.returncode != 0:
        raise RuntimeError(error or process.stderr.strip() or f"bridge exited with code {process.returncode}")
