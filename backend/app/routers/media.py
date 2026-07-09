import subprocess

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from ..paths import resolve_under_data_root

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("")
def get_media(path: str = Query(...)):
    """Serves an image or video file for visual comparison. Uses Starlette's
    `FileResponse`, which already handles `Range` requests, so a `<video>`
    element can seek/scrub without any extra work here.
    """
    target = resolve_under_data_root(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(target)


def _extract_frame(path: str, seek: str | None) -> subprocess.CompletedProcess:
    cmd = ["ffmpeg", "-v", "error"]
    if seek is not None:
        cmd += ["-ss", seek]
    cmd += ["-i", path, "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-"]
    return subprocess.run(cmd, capture_output=True)


@router.get("/thumbnail")
def get_thumbnail(path: str = Query(...)):
    """Extracts a single frame from a video as a JPEG, for a static preview
    (the preview panel shows this instead of a playable video; actual
    playback only happens in the double-click overlay via `GET /api/media`).
    """
    target = resolve_under_data_root(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")

    result = _extract_frame(str(target), seek="1")
    if result.returncode != 0 or not result.stdout:
        # Very short videos have no frame at the 1s mark - fall back to the first frame.
        result = _extract_frame(str(target), seek=None)
    if result.returncode != 0 or not result.stdout:
        raise HTTPException(status_code=500, detail="failed to generate thumbnail")

    return Response(content=result.stdout, media_type="image/jpeg")
