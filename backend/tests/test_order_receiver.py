import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import server


@pytest.mark.parametrize(
    ("current_status", "expected"),
    [
        ("pending", ["confirmed", "preparing", "ready_for_delivery"]),
        ("confirmed", ["preparing", "ready_for_delivery"]),
        ("preparing", ["ready_for_delivery"]),
        ("ready_for_delivery", []),
        ("delivered", None),
    ],
)
def test_receiver_ready_status_path(current_status, expected):
    assert server.receiver_ready_status_path(current_status) == expected


def test_receiver_role_guard_rejects_other_roles():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(server.require_order_receiver({"role": "manager"}))
    assert exc_info.value.status_code == 403


class FakeOrders:
    def __init__(self, order):
        self.order = deepcopy(order)

    async def find_one(self, query, projection=None):
        if self.order.get("id") != query.get("id"):
            return None
        return deepcopy(self.order)

    async def find_one_and_update(self, query, update):
        if self.order.get("id") != query.get("id") or self.order.get("status") != query.get("status"):
            return None
        self.order.update(update.get("$set", {}))
        return deepcopy(self.order)


def test_receiver_ready_action_preserves_valid_history(monkeypatch):
    order = {
        "id": "ORD-1",
        "status": "pending",
        "timeline": [{"status": "pending", "at": "2026-01-01T00:00:00Z"}],
    }
    orders = FakeOrders(order)
    monkeypatch.setattr(server, "db", SimpleNamespace(orders=orders))
    notifications = []

    async def capture_notification(order_id, status):
        notifications.append((order_id, status))

    monkeypatch.setattr(server, "notify_customer_status", capture_notification)
    result = asyncio.run(server.receiver_mark_ready("ORD-1", {"role": "order_receiver"}))

    assert result == {"ok": True, "status": "ready_for_delivery"}
    assert orders.order["status"] == "ready_for_delivery"
    assert [entry["status"] for entry in orders.order["timeline"]] == [
        "pending", "confirmed", "preparing", "ready_for_delivery"
    ]
    assert notifications == [("ORD-1", "ready_for_delivery")]
