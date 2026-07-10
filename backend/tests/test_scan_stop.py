import time


def _wait_for_scan(client, scan_id: int, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/scans/{scan_id}")
        body = response.json()
        if body["status"] in ("done", "error", "stopped"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"scan {scan_id} did not reach a final status within {timeout}s")


def test_stop_running_scan(app_client_slow_bridge):
    client, data_root = app_client_slow_bridge
    folder = data_root / "library"
    folder.mkdir()

    response = client.post("/api/scans", json={"tool": "duplicates", "directories": [str(folder)]})
    assert response.status_code == 200
    scan_id = response.json()["id"]

    time.sleep(0.3)  # give the background thread a moment to actually spawn the subprocess

    stop_response = client.post(f"/api/scans/{scan_id}/stop")
    assert stop_response.status_code == 200

    body = _wait_for_scan(client, scan_id)
    assert body["status"] == "stopped"


def test_stop_rejects_scan_that_already_finished(app_client):
    client, data_root = app_client
    folder = data_root / "library"
    folder.mkdir()

    response = client.post("/api/scans", json={"tool": "duplicates", "directories": [str(folder)]})
    scan_id = response.json()["id"]
    _wait_for_scan(client, scan_id)  # stub bridge (/bin/true) finishes instantly

    stop_response = client.post(f"/api/scans/{scan_id}/stop")
    assert stop_response.status_code == 400


def test_stop_rejects_unknown_scan_id(app_client):
    client, _data_root = app_client
    response = client.post("/api/scans/999999/stop")
    assert response.status_code == 404


def test_latest_scan_reattaches_after_reload(app_client):
    client, data_root = app_client
    folder = data_root / "library"
    folder.mkdir()

    response = client.post("/api/scans", json={"tool": "duplicates", "directories": [str(folder)], "reference_directories": []})
    scan_id = response.json()["id"]

    latest = client.get("/api/scans/latest?tool=duplicates").json()
    assert latest["id"] == scan_id


def test_latest_scan_is_null_when_tool_never_scanned(app_client):
    client, _data_root = app_client
    response = client.get("/api/scans/latest?tool=bad_extensions")
    assert response.status_code == 200
    assert response.json() is None
