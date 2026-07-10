import shutil
import time
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "bridge" / "tests" / "fixtures"


def _wait_for_scan(client, scan_id: int, timeout: float = 15.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/scans/{scan_id}")
        body = response.json()
        if body["status"] in ("done", "error"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"scan {scan_id} did not finish within {timeout}s")


def test_duplicates_scan_finds_identical_files(app_client_real_bridge):
    client, data_root = app_client_real_bridge
    library = data_root / "library"
    downloads = data_root / "downloads"
    library.mkdir()
    downloads.mkdir()
    (library / "photo1.txt").write_text("same content")
    (downloads / "photo1_copy.txt").write_text("same content")

    response = client.post(
        "/api/scans",
        json={"tool": "duplicates", "directories": [str(library), str(downloads)]},
    )
    assert response.status_code == 200
    scan_id = response.json()["id"]

    body = _wait_for_scan(client, scan_id)
    assert body["status"] == "done", body.get("error_message")
    result_text = str(body["result"])
    assert str(library / "photo1.txt") in result_text
    assert str(downloads / "photo1_copy.txt") in result_text


def test_similar_images_scan_accepts_custom_options(app_client_real_bridge):
    client, data_root = app_client_real_bridge
    folder = data_root / "library"
    folder.mkdir()
    shutil.copy(FIXTURES_DIR / "image_a.png", folder / "image_a.png")
    shutil.copy(FIXTURES_DIR / "image_b.png", folder / "image_b.png")

    response = client.post(
        "/api/scans",
        json={
            "tool": "similar_images",
            "directories": [str(folder)],
            "max_difference": 40,
            "hash_size": 8,
            "hash_alg": "blockhash",
            "resize_algorithm": "lanczos3",
            "ignore_same_size": True,
        },
    )
    assert response.status_code == 200
    scan_id = response.json()["id"]

    body = _wait_for_scan(client, scan_id)
    assert body["status"] == "done", body.get("error_message")


def test_scan_rejects_directory_outside_data_root(app_client):
    client, _data_root = app_client
    response = client.post(
        "/api/scans",
        json={"tool": "duplicates", "directories": ["/etc"]},
    )
    assert response.status_code == 400


def test_scan_rejects_unknown_tool(app_client):
    client, data_root = app_client
    response = client.post(
        "/api/scans",
        json={"tool": "not_a_real_tool", "directories": [str(data_root)]},
    )
    assert response.status_code == 422
