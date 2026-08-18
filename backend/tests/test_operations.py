def test_create_operation_and_counts(app_client):
    client, data_root = app_client
    src = data_root / "a.txt"
    src.write_text("a")

    response = client.post(
        "/api/operations",
        json={"category": "duplicates", "op_type": "delete", "src_path": str(src)},
    )
    assert response.status_code == 200
    op = response.json()
    assert op["status"] == "pending"

    counts = client.get("/api/operations/counts").json()["counts"]
    assert counts == {"duplicates": 1}

    listed = client.get("/api/operations", params={"category": "duplicates"}).json()
    assert len(listed) == 1
    assert listed[0]["id"] == op["id"]


def test_hardlink_requires_dst_path(app_client):
    client, data_root = app_client
    src = data_root / "a.txt"
    src.write_text("a")

    response = client.post(
        "/api/operations",
        json={"category": "duplicates", "op_type": "hardlink", "src_path": str(src)},
    )
    assert response.status_code == 400


def test_operation_rejects_path_outside_data_root(app_client):
    client, _data_root = app_client
    response = client.post(
        "/api/operations",
        json={"category": "duplicates", "op_type": "delete", "src_path": "/etc/passwd"},
    )
    assert response.status_code == 400


def test_delete_pending_operation(app_client):
    client, data_root = app_client
    src = data_root / "a.txt"
    src.write_text("a")
    op = client.post(
        "/api/operations",
        json={"category": "duplicates", "op_type": "delete", "src_path": str(src)},
    ).json()

    response = client.delete(f"/api/operations/{op['id']}")
    assert response.status_code == 200
    assert client.get("/api/operations", params={"category": "duplicates"}).json() == []


def test_apply_is_best_effort_across_failures(app_client, monkeypatch):
    client, data_root = app_client
    ok_file = data_root / "ok.txt"
    ok_file.write_text("ok")
    missing_file = data_root / "missing.txt"  # never created -> action will fail

    client.post("/api/operations", json={"category": "duplicates", "op_type": "delete", "src_path": str(ok_file)})
    client.post("/api/operations", json={"category": "duplicates", "op_type": "delete", "src_path": str(missing_file)})

    import app.routers.operations as operations_module

    def fake_run_action(op_type, src_path, dst_path):
        if "missing" in src_path:
            raise RuntimeError("file does not exist")
        # simulate the real bridge actually deleting the file
        from pathlib import Path

        Path(src_path).unlink()

    monkeypatch.setattr(operations_module.bridge, "run_action", fake_run_action)

    response = client.post("/api/operations/apply", params={"category": "duplicates"})
    assert response.status_code == 200
    results = {r["src_path"]: r for r in response.json()}

    assert results[str(ok_file)]["status"] == "done"
    assert results[str(missing_file)]["status"] == "failed"
    assert "does not exist" in results[str(missing_file)]["error_message"]
    assert not ok_file.exists()

    # Applied operations should not show up in a later counts/pending listing.
    assert client.get("/api/operations/counts").json()["counts"] == {}


def test_rename_requires_dst_path(app_client):
    client, data_root = app_client
    src = data_root / "photo.txt"
    src.write_text("a")

    response = client.post(
        "/api/operations",
        json={"category": "bad_extensions", "op_type": "rename", "src_path": str(src)},
    )
    assert response.status_code == 400


def test_apply_rename_moves_the_file(app_client_real_bridge):
    client, data_root = app_client_real_bridge
    src = data_root / "photo.txt"
    dst = data_root / "photo.jpg"
    src.write_text("actually a jpeg")

    client.post(
        "/api/operations",
        json={"category": "bad_extensions", "op_type": "rename", "src_path": str(src), "dst_path": str(dst)},
    )

    report = client.post("/api/operations/apply", params={"category": "bad_extensions"}).json()
    assert report[0]["status"] == "done", report[0]["error_message"]
    assert not src.exists()
    assert dst.read_text() == "actually a jpeg"


def test_apply_rename_does_not_clobber_an_existing_file(app_client_real_bridge):
    client, data_root = app_client_real_bridge
    src = data_root / "photo.txt"
    dst = data_root / "photo.jpg"
    src.write_text("actually a jpeg")
    dst.write_text("an unrelated file")

    client.post(
        "/api/operations",
        json={"category": "bad_extensions", "op_type": "rename", "src_path": str(src), "dst_path": str(dst)},
    )

    report = client.post("/api/operations/apply", params={"category": "bad_extensions"}).json()
    assert report[0]["status"] == "failed"
    assert src.exists()
    assert dst.read_text() == "an unrelated file"
