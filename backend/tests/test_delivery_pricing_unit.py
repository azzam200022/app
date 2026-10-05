import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest

import server


class FakeCursor:
    def __init__(self, documents):
        self.documents = deepcopy(documents)

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, length=None):
        return self.documents[:length] if length is not None else self.documents


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = deepcopy(documents or [])

    def find(self, query=None, _projection=None):
        query = query or {}
        matches = [
            document
            for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        ]
        return FakeCursor(matches)

    async def find_one(self, query=None, _projection=None):
        matches = await self.find(query).to_list(1)
        return matches[0] if matches else None

    async def update_one(self, query, update, upsert=False):
        document = next(
            (
                item
                for item in self.documents
                if all(item.get(key) == value for key, value in query.items())
            ),
            None,
        )
        if document is None:
            if not upsert:
                return SimpleNamespace(matched_count=0, modified_count=0)
            document = deepcopy(query)
            self.documents.append(document)
        document.update(deepcopy(update.get("$set", {})))
        return SimpleNamespace(matched_count=1, modified_count=1)


class FakeDatabase:
    def __init__(self, areas=None, settings=None):
        self.delivery_areas = FakeCollection(areas)
        self.delivery_settings = FakeCollection(settings)


@pytest.fixture
def fake_db(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(server, "db", database)
    return database


def run(coroutine):
    return asyncio.run(coroutine)


def test_unconfigured_locations_use_2000_iqd_default(fake_db):
    area = run(server.resolve_delivery_area_for_location(33.3152, 44.3661))

    assert area["id"] == "default_delivery"
    assert area["fee"] == 2000
    assert area["uses_default_fee"] is True


def test_locations_outside_custom_zones_use_default_instead_of_being_rejected(fake_db):
    fake_db.delivery_areas.documents.append({
        "id": "area_1",
        "name": "الكرادة",
        "fee": 4500,
        "center_lat": 33.3152,
        "center_lng": 44.3661,
        "radius_km": 2,
        "is_active": True,
    })

    area = run(server.resolve_delivery_area_for_location(33.5, 44.5))

    assert area["id"] == "default_delivery"
    assert area["fee"] == 2000


def test_area_without_special_fee_inherits_editable_default(fake_db):
    fake_db.delivery_settings.documents.append({"id": "default", "default_fee": 2750})
    fake_db.delivery_areas.documents.append({
        "id": "area_1",
        "name": "الكرادة",
        "fee": None,
        "center_lat": 33.3152,
        "center_lng": 44.3661,
        "radius_km": 2,
        "is_active": True,
    })

    area = run(server.resolve_delivery_area_for_location(33.316, 44.3661))

    assert area["fee"] == 2750
    assert area["uses_default_fee"] is True


def test_area_specific_fee_overrides_global_rate(fake_db):
    fake_db.delivery_settings.documents.append({"id": "default", "default_fee": 2000})
    fake_db.delivery_areas.documents.append({
        "id": "area_custom",
        "name": "الكرادة",
        "fee": 4500,
        "center_lat": 33.3152,
        "center_lng": 44.3661,
        "radius_km": 2,
        "is_active": True,
    })

    area = run(server.resolve_delivery_area_for_location(33.316, 44.3661))

    assert area["fee"] == 4500
    assert area["uses_default_fee"] is False


def test_explicit_area_fee_takes_priority_and_zero_is_a_valid_free_rate(fake_db):
    fake_db.delivery_areas.documents.append({
        "id": "area_free",
        "name": "المنطقة المجانية",
        "fee": 0,
        "center_lat": 33.3152,
        "center_lng": 44.3661,
        "radius_km": 2,
        "is_active": True,
    })

    area = run(server.resolve_delivery_area_for_location(33.316, 44.3661))

    assert area["fee"] == 0
    assert area["uses_default_fee"] is False


def test_manager_can_save_default_fee_and_quotes_use_it(fake_db, monkeypatch):
    monkeypatch.setattr(server, "configured_store_road_distance_km", lambda *_: asyncio.sleep(0, result=None))
    fake_db.delivery_areas.documents.append({
        "id": "area_1",
        "name": "الكرادة",
        "fee": 4500,
        "center_lat": 33.3152,
        "center_lng": 44.3661,
        "radius_km": 2,
        "is_active": True,
    })
    body = server.DeliveryPricingUpdate(default_fee=3500.5)
    run(server.update_admin_delivery_pricing(body, user={"role": "manager"}))

    quote = run(server.delivery_quote(
        server.DeliveryQuoteIn(lat=33.5, lng=44.5),
        user={"user_id": "customer"},
    ))

    assert fake_db.delivery_settings.documents[0]["default_fee"] == 3500.5
    assert quote["fee"] == 3500.5
    assert quote["area_id"] == "default_delivery"
