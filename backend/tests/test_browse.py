def test_lists_entries_under_data_root(app_client):
    client, data_root = app_client
    (data_root / "library").mkdir()
    (data_root / "notes.txt").write_text("hi")

    response = client.get("/api/browse")
    assert response.status_code == 200
    names = {entry["name"] for entry in response.json()}
    assert names == {"library", "notes.txt"}


def test_lists_entries_in_subfolder(app_client):
    client, data_root = app_client
    sub = data_root / "library" / "photos"
    sub.mkdir(parents=True)
    (sub / "a.jpg").write_text("fake image")

    response = client.get("/api/browse", params={"path": str(sub)})
    assert response.status_code == 200
    assert [entry["name"] for entry in response.json()] == ["a.jpg"]


def test_rejects_path_traversal_outside_data_root(app_client):
    client, _data_root = app_client
    response = client.get("/api/browse", params={"path": "../../etc"})
    assert response.status_code == 400


def test_missing_directory_returns_404(app_client):
    client, _data_root = app_client
    response = client.get("/api/browse", params={"path": "does-not-exist"})
    assert response.status_code == 404
