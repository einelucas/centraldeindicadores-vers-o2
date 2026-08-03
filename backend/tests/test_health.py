from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "Central de Indicadores API"


def test_migration_modules_endpoint() -> None:
    response = client.get("/api/v1/migration/modules")

    assert response.status_code == 200
    payload = response.json()
    assert payload["modules"][0]["key"] == "platform"
    assert payload["modules"][1]["key"] == "scorecard"
