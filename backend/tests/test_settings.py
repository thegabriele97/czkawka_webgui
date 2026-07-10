def test_settings_empty_before_any_scan(app_client):
    client, _data_root = app_client
    response = client.get("/api/settings/similar_images")
    assert response.status_code == 200
    assert response.json() == {"tool": "similar_images", "options": {}}


def test_scan_persists_options_for_similar_images(app_client):
    client, data_root = app_client
    folder = data_root / "library"
    folder.mkdir()

    response = client.post(
        "/api/scans",
        json={
            "tool": "similar_images",
            "directories": [str(folder)],
            "max_difference": 12,
            "ignore_same_size": True,
            "hash_size": 32,
            "hash_alg": "blockhash",
            "resize_algorithm": "lanczos3",
        },
    )
    assert response.status_code == 200

    settings = client.get("/api/settings/similar_images").json()
    assert settings["options"] == {
        "min_size": 0,
        "max_size": None,
        "max_difference": 12,
        "ignore_same_size": True,
        "hash_size": 32,
        "hash_alg": "blockhash",
        "resize_algorithm": "lanczos3",
    }


def test_scan_persists_options_for_similar_videos(app_client):
    client, data_root = app_client
    folder = data_root / "library"
    folder.mkdir()

    response = client.post(
        "/api/scans",
        json={
            "tool": "similar_videos",
            "directories": [str(folder)],
            "tolerance": 15,
            "ignore_same_size": True,
            "crop_detect": False,
            "skip_forward_amount": 20,
            "vid_hash_duration": 8,
        },
    )
    assert response.status_code == 200

    settings = client.get("/api/settings/similar_videos").json()
    assert settings["options"] == {
        "min_size": 0,
        "max_size": None,
        "tolerance": 15,
        "ignore_same_size": True,
        "crop_detect": False,
        "skip_forward_amount": 20,
        "vid_hash_duration": 8,
    }


def test_settings_rejects_unknown_tool(app_client):
    client, _data_root = app_client
    response = client.get("/api/settings/not_a_real_tool")
    assert response.status_code == 422
