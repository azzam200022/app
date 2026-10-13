import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, length=None):
        return list(self.documents if length is None else self.documents[:length])


class FakeOrders:
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, query, projection=None):
        return next((dict(doc) for doc in self.documents if doc.get("id") == query.get("id")), None)

    def find(self, query, projection=None):
        return FakeCursor([
            doc for doc in self.documents
            if all(doc.get(key) == value for key, value in query.items())
        ])


class FakeReturns:
    def __init__(self, document=None):
        self.document = dict(document or {})
        self.update_count = 0

    def find(self, query, projection=None):
        matches = [
            dict(self.document)
        ] if self.document and all(self.document.get(key) == value for key, value in query.items()) else []
        return FakeCursor(matches)

    async def find_one(self, query, projection=None):
        if query.get("id") != self.document.get("id"):
            return None
        if query.get("agent_id") and query["agent_id"] != self.document.get("agent_id"):
            return None
        return dict(self.document)

    async def update_one(self, query, update):
        if query.get("id") != self.document.get("id"):
            return SimpleNamespace(matched_count=0)
        if query.get("agent_id") and query["agent_id"] != self.document.get("agent_id"):
            return SimpleNamespace(matched_count=0)
        self.document.update(update.get("$set", {}))
        self.update_count += 1
        return SimpleNamespace(matched_count=1)


def test_partial_return_is_subtracted_from_delivery_invoice_amount():
    original_total, amount_due = server.order_amounts({
        "total": 12000,
        "returned_total": 3500,
        "return_status": "partial",
        "status": "delivered",
    })

    assert original_total == 12000
    assert amount_due == 8500


def test_full_return_has_no_delivery_invoice_amount():
    assert server.order_amounts({
        "total": 12000,
        "returned_total": 12000,
        "return_status": "full",
        "status": "returned",
    }) == (12000, 0)


def test_delivery_summary_uses_order_amount_due_after_partial_return(monkeypatch):
    delivered_at = server.now_utc().isoformat()
    order = {
        "id": "ORD123",
        "agent_id": "agent-1",
        "status": "delivered",
        "total": 12000,
        "returned_total": 3500,
        "return_status": "partial",
        "delivered_at": delivered_at,
        "delivery_fee": 1000,
        "agent_fee": 1000,
    }
    monkeypatch.setattr(server, "db", SimpleNamespace(
        orders=FakeOrders([order]),
        returns=FakeReturns(),
    ))

    result = asyncio.run(server.delivery_summary(
        date=server.now_utc().date().isoformat(),
        tz_offset_minutes=0,
        user={"user_id": "agent-1"},
    ))

    assert result["invoices_total"] == 8500


def test_customer_order_includes_return_review_status(monkeypatch):
    order = {
        "id": "ORD123",
        "user_id": "customer-1",
        "status": "delivered",
        "total": 12000,
        "returned_total": 3500,
        "return_status": "partial",
    }
    returns = FakeReturns({
        "id": "RET123",
        "order_id": "ORD123",
        "total": 3500,
        "return_type": "partial",
        "status": "reviewed",
        "created_at": "2026-01-01T00:00:00+00:00",
        "reviewed_at": "2026-01-01T01:00:00+00:00",
    })
    monkeypatch.setattr(server, "db", SimpleNamespace(
        orders=FakeOrders([order]),
        returns=returns,
    ))

    result = asyncio.run(server.get_order(
        "ORD123",
        {"role": "customer", "user_id": "customer-1"},
    ))

    assert result["returns"][0]["status"] == "reviewed"
    assert result["returns"][0]["reviewed_at"] == "2026-01-01T01:00:00+00:00"


def test_manager_can_review_return_assigned_to_a_delivery_agent(monkeypatch):
    returns = FakeReturns({"id": "RET123", "agent_id": "agent-1", "status": "pending_review"})
    monkeypatch.setattr(server, "db", SimpleNamespace(returns=returns))

    reviewed = asyncio.run(server.admin_review_return(
        "RET123",
        {"user_id": "manager-1", "name": "مدير الاختبار", "role": "manager"},
    ))

    assert reviewed["status"] == "reviewed"
    assert reviewed["manager_received_at"]
    assert reviewed["reviewed_by_manager_id"] == "manager-1"
    assert reviewed["reviewed_by_manager_name"] == "مدير الاختبار"
    assert reviewed["reviewed_at"]


def test_manager_reviewing_a_return_again_is_idempotent(monkeypatch):
    returns = FakeReturns({
        "id": "RET123",
        "agent_id": "agent-1",
        "status": "reviewed",
        "manager_received_at": "2026-01-01T00:00:00+00:00",
        "reviewed_at": "2026-01-01T00:00:00+00:00",
    })
    monkeypatch.setattr(server, "db", SimpleNamespace(returns=returns))

    reviewed = asyncio.run(server.admin_review_return(
        "RET123",
        {"user_id": "manager-1", "name": "مدير الاختبار", "role": "manager"},
    ))

    assert reviewed["manager_received_at"] == "2026-01-01T00:00:00+00:00"
    assert reviewed["reviewed_at"] == "2026-01-01T00:00:00+00:00"
    assert returns.update_count == 0


def test_delivery_agent_cannot_review_return_through_manager_route(monkeypatch):
    returns = FakeReturns({"id": "RET123", "agent_id": "agent-1", "status": "pending_review"})
    monkeypatch.setattr(server, "db", SimpleNamespace(returns=returns))
    monkeypatch.setitem(
        server.app.dependency_overrides,
        server.require_user,
        lambda: {"user_id": "agent-1", "name": "مندوب الاختبار", "role": "delivery"},
    )

    response = TestClient(server.app).post("/api/admin/returns/RET123/review")

    assert response.status_code == 403
    assert returns.update_count == 0
