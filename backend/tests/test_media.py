def test_serves_file_contents(app_client):
    client, data_root = app_client
    f = data_root / "note.txt"
    f.write_text("hello media")

    response = client.get("/api/media", params={"path": str(f)})
    assert response.status_code == 200
    assert response.content == b"hello media"


def test_missing_file_returns_404(app_client):
    client, data_root = app_client
    response = client.get("/api/media", params={"path": str(data_root / "nope.txt")})
    assert response.status_code == 404


def test_rejects_path_outside_data_root(app_client):
    client, _data_root = app_client
    response = client.get("/api/media", params={"path": "/etc/passwd"})
    assert response.status_code == 400


def test_supports_range_requests_for_video_scrubbing(app_client):
    client, data_root = app_client
    f = data_root / "clip.bin"
    f.write_bytes(b"0123456789")

    response = client.get("/api/media", params={"path": str(f)}, headers={"Range": "bytes=2-5"})
    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["content-range"] == "bytes 2-5/10"


def test_thumbnail_extracts_a_frame_from_a_video(app_client):
    import subprocess

    client, data_root = app_client
    video = data_root / "clip.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=2", "-frames:v", "50", str(video)],
        check=True,
    )

    response = client.get("/api/media/thumbnail", params={"path": str(video)})
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content[:2] == b"\xff\xd8"  # JPEG magic bytes


def test_thumbnail_missing_file_returns_404(app_client):
    client, data_root = app_client
    response = client.get("/api/media/thumbnail", params={"path": str(data_root / "nope.mp4")})
    assert response.status_code == 404
