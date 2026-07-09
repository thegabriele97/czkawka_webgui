def test_get_config_returns_data_root(app_client):
    client, data_root = app_client
    response = client.get("/api/config")
    assert response.status_code == 200
    assert response.json() == {"data_root": str(data_root)}
