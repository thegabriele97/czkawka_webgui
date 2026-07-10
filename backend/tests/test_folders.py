def test_folders_empty_by_default(app_client):
    client, _data_root = app_client
    response = client.get("/api/folders")
    assert response.status_code == 200
    assert response.json() == {"folders": []}


def test_folders_round_trip(app_client):
    client, data_root = app_client
    folders = [
        {"path": str(data_root / "library"), "is_reference": True},
        {"path": str(data_root / "downloads"), "is_reference": False},
    ]

    put_response = client.put("/api/folders", json={"folders": folders})
    assert put_response.status_code == 200
    assert put_response.json() == {"folders": folders}

    get_response = client.get("/api/folders")
    assert get_response.status_code == 200
    assert get_response.json() == {"folders": folders}


def test_folders_put_replaces_previous_selection(app_client):
    client, data_root = app_client
    first = [{"path": str(data_root / "library"), "is_reference": False}]
    second = [{"path": str(data_root / "downloads"), "is_reference": True}]

    client.put("/api/folders", json={"folders": first})
    client.put("/api/folders", json={"folders": second})

    response = client.get("/api/folders")
    assert response.json() == {"folders": second}
