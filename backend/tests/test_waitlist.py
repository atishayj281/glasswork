import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import ADMIN_EMAILS, ADMIN_SECRET_KEY
from app.services.waitlist_store import waitlist_store

client = TestClient(app)


def test_submit_waitlist_valid():
    response = client.post(
        "/api/waitlist",
        json={"email": "newuser@example.com", "use_case": "Automating CSV reports", "source": "landing_page"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "ok"
    assert data["email"] == "newuser@example.com"
    assert "on the list" in data["message"].lower()

    # Verify stored in waitlist_store as pending
    entry = waitlist_store.get_entry_by_email("newuser@example.com")
    assert entry is not None
    assert entry.status.value == "pending"
    assert entry.use_case == "Automating CSV reports"


def test_submit_waitlist_invalid_email():
    response = client.post(
        "/api/waitlist",
        json={"email": "not-an-email", "source": "landing_page"},
    )
    assert response.status_code == 400
    assert "valid email" in response.json()["detail"].lower()


def test_check_waitlist_status():
    # Unlisted user
    res1 = client.get("/api/waitlist/status?email=unlisted@example.com")
    assert res1.status_code == 200
    assert res1.json()["status"] == "unlisted"

    # Pending user
    client.post("/api/waitlist", json={"email": "pendinguser@example.com"})
    res2 = client.get("/api/waitlist/status?email=pendinguser@example.com")
    assert res2.status_code == 200
    assert res2.json()["status"] == "pending"

    # Admin email
    admin_email = ADMIN_EMAILS[0] if ADMIN_EMAILS else "atishay.jain1203@gmail.com"
    res3 = client.get(f"/api/waitlist/status?email={admin_email}")
    assert res3.status_code == 200
    assert res3.json()["status"] == "approved"


def test_admin_approve_waitlist_entry():
    email = "toapprove@example.com"
    client.post("/api/waitlist", json={"email": email, "use_case": "Data engineering"})

    # Try approving without admin credentials -> 403
    res_unauth = client.post(f"/api/admin/waitlist/{email}/approve")
    assert res_unauth.status_code == 403

    # Approve using admin email header
    admin_email = ADMIN_EMAILS[0] if ADMIN_EMAILS else "atishay.jain1203@gmail.com"
    res_auth = client.post(
        f"/api/admin/waitlist/{email}/approve",
        headers={"X-Admin-Email": admin_email},
    )
    assert res_auth.status_code == 200
    data = res_auth.json()
    assert data["status"] == "ok"
    assert data["waitlist_status"] == "approved"
    assert data["approved_at"] is not None

    # Check status now
    res_status = client.get(f"/api/waitlist/status?email={email}")
    assert res_status.json()["status"] == "approved"


def test_unapproved_user_blocked_from_product_routes():
    email = "pending_blocked@example.com"
    client.post("/api/waitlist", json={"email": email})

    # Attempt to hit /api/upload
    res = client.post(
        "/api/upload",
        headers={"X-User-Email": email},
        files={"file": ("test.csv", "a,b\n1,2", "text/csv")},
    )
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["error"] == "waitlist_pending"
    assert "on the waitlist" in detail["message"].lower()


def test_approved_user_allowed_past_waitlist_gate():
    email = "approved_user@example.com"
    client.post("/api/waitlist", json={"email": email})
    waitlist_store.approve_entry(email)

    # Attempt to hit /api/upload with approved user header
    # It will pass waitlist gate (might fail later on actual file processing/upload, but NOT 403 waitlist_pending)
    res = client.post(
        "/api/upload",
        headers={"X-User-Email": email},
        files={"file": ("sample.csv", "col1,col2\nval1,val2", "text/csv")},
    )
    assert res.status_code != 403 or res.json().get("detail", {}).get("error") != "waitlist_pending"
