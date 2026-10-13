import asyncio

import pytest

from delivery_routing import calculate_driving_distance_km, parse_openrouteservice_distance_km


def test_parses_openrouteservice_json_route_distance_to_kilometers():
    payload = {"routes": [{"summary": {"distance": 4321.4}}]}

    assert parse_openrouteservice_distance_km(payload) == pytest.approx(4.32)


def test_parses_openrouteservice_geojson_route_distance_to_kilometers():
    payload = {"features": [{"properties": {"summary": {"distance": 812.0}}}]}

    assert parse_openrouteservice_distance_km(payload) == pytest.approx(0.81)


@pytest.mark.parametrize("payload", [
    None,
    {},
    {"routes": []},
    {"features": []},
    {"features": [{"properties": {}}]},
    {"routes": [{"summary": {"distance": -1}}]},
    {"routes": [{"summary": {"distance": "not-a-number"}}]},
])
def test_ignores_missing_or_invalid_route_distance(payload):
    assert parse_openrouteservice_distance_km(payload) is None


def test_routing_is_optional_when_api_key_is_missing(monkeypatch):
    monkeypatch.delenv("OPENROUTESERVICE_API_KEY", raising=False)

    result = asyncio.run(calculate_driving_distance_km(33.3152, 44.3661, 33.32, 44.37))

    assert result is None
