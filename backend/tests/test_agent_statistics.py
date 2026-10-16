from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
import asyncio

import pytest
from fastapi import HTTPException

import server


class FakeCursor:
    def __init__(self, documents):
        self.documents = deepcopy(documents)

    def sort(self, field, direction=1):
        self.documents.sort(key=lambda item: item.get(field) or "", reverse=direction < 0)
        return self

    async def to_list(self, length=None):
        return self.documents[:length] if length is not None else self.documents


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = deepcopy(documents or [])

    @staticmethod
    def matches(document, query):
        for key, expected in (query or {}).items():
            actual = document.get(key)
            if isinstance(expected, dict) and "$in" in expected:
                if actual not in expected["$in"]:
                    return False
            elif actual != expected:
                return False
        return True

    def find(self, query=None, projection=None):
        documents = [item for item in self.documents if self.matches(item, query or {})]
        if projection:
            included = [key for key, value in projection.items() if key != "_id" and value]
            if included:
                documents = [{key: item[key] for key in included if key in item} for item in documents]
            else:
                documents = [
                    {key: value for key, value in item.items() if projection.get(key, 1)}
                    for item in documents
                ]
        return FakeCursor(documents)

    async def find_one(self, query=None, projection=None):
        documents = await self.find(query, projection).to_list(1)
        return documents[0] if documents else None

    async def insert_one(self, document):
        self.documents.append(deepcopy(document))
        return SimpleNamespace(inserted_id=document.get("id"))


@pytest.fixture
def agent_db(monkeypatch):
    now = datetime(2026, 10, 16, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(server, "now_utc", lambda: now)
    database = SimpleNamespace(
        users=FakeCollection([{
            "user_id": "agent-1",
            "role": "delivery",
            "name": "علي",
            "email": "agent@example.com",
            "phone": "07700000000",
            "password_hash": "must-not-be-returned",
        }]),
        orders=FakeCollection([
            {
                "id": "ORDER-TODAY",
                "agent_id": "agent-1",
                "status": "delivered",
                "total": 10000,
                "returned_total": 1000,
                "return_status": "partial",
                "agent_fee": 1000,
                "delivered_at": "2026-10-16T09:00:00+00:00",
            },
            {
                "id": "ORDER-YESTERDAY",
                "agent_id": "agent-1",
                "status": "delivered",
                "total": 5000,
                "delivery_fee": 500,
                "delivered_at": "2026-10-15T15:00:00+00:00",
            },
            {
                "id": "ORDER-ACTIVE",
                "agent_id": "agent-1",
                "status": "out_for_delivery",
                "agent_location": {
                    "lat": 33.3152,
                    "lng": 44.3661,
                    "at": "2026-10-16T09:59:00+00:00",
                },
            },
        ]),
        agent_cash_receipts=FakeCollection([
            {
                "id": "RECEIPT-TODAY",
                "agent_id": "agent-1",
                "amount": 2000,
                "settlement_date": "2026-10-16",
                "received_at": "2026-10-16T09:30:00+00:00",
                "receiver_name": "المدير",
            },
            {
                "id": "RECEIPT-OLD",
                "agent_id": "agent-1",
                "amount": 1000,
                "settlement_date": "2026-10-15",
                "received_at": "2026-10-15T09:30:00+00:00",
                "receiver_name": "المدير",
            },
        ]),
    )
    monkeypatch.setattr(server, "db", database)
    return database


def run(coroutine):
    return asyncio.run(coroutine)


def manager():
    return {"user_id": "manager-1", "name": "مدير الاختبار", "role": "manager"}


def test_agent_overview_calculates_today_all_time_and_cash(agent_db):
    result = run(server.admin_agent_overview("2026-10-16", -180, user=manager()))

    assert result["date"] == "2026-10-16"
    assert result["totals"] == {
        "agents_count": 1,
        "active_agents": 1,
        "delivered_today": 1,
        "invoices_today": 9000,
        "earnings_today": 1000,
        "cash_received_today": 2000,
        "cash_outstanding": 9500,
    }
    agent = result["agents"][0]
    assert agent["all_time_delivered_count"] == 2
    assert agent["all_time_invoice_total"] == 14000
    assert agent["all_time_earnings"] == 1500
    assert agent["total_cash_received"] == 3000
    assert agent["cash_outstanding"] == 9500
    assert agent["active_orders"] == 1
    assert agent["location_is_live"] is True
    assert agent["last_location"]["lat"] == 33.3152
    assert "password_hash" not in agent


def test_agent_summary_returns_receipts_newest_first(agent_db):
    result = run(server.admin_agent_summary(
        "agent-1", "2026-10-16", -180, user=manager()
    ))

    assert result["agent"]["user_id"] == "agent-1"
    assert [item["id"] for item in result["receipts"]] == ["RECEIPT-TODAY", "RECEIPT-OLD"]
    assert result["receipts"][0]["receiver_name"] == "المدير"


def test_manager_cash_receipt_persists_and_reduces_outstanding(agent_db):
    result = run(server.admin_receive_agent_cash(
        "agent-1",
        server.AgentCashReceiptIn(amount=2000, settlement_date="2026-10-16"),
        user=manager(),
    ))

    assert result["ok"] is True
    assert result["cash_outstanding"] == 7500
    receipt = agent_db.agent_cash_receipts.documents[-1]
    assert receipt["amount"] == 2000
    assert receipt["receiver_id"] == "manager-1"
    assert receipt["receiver_name"] == "مدير الاختبار"
    assert receipt["settlement_date"] == "2026-10-16"


def test_manager_cannot_receive_more_than_agent_outstanding(agent_db):
    with pytest.raises(HTTPException) as error:
        run(server.admin_receive_agent_cash(
            "agent-1",
            server.AgentCashReceiptIn(amount=10000, settlement_date="2026-10-16"),
            user=manager(),
        ))

    assert error.value.status_code == 400
    assert len(agent_db.agent_cash_receipts.documents) == 2
