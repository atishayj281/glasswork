import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_submit_waitlist_valid():
    response = client.post(
        "/api/waitlist",
        json={"email": "user@example.com", "source": "pricing_page"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "ok"
    assert data["email"] == "user@example.com"


def test_submit_waitlist_invalid_email():
    response = client.post(
        "/api/waitlist",
        json={"email": "not-an-email", "source": "pricing_page"},
    )
    assert response.status_code == 400
    assert "valid email" in response.json()["detail"].lower()
