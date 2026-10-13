"""Optional, server-side OpenRouteService distance lookups for delivery quotes."""
import logging
import math
import os
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)
OPENROUTESERVICE_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car"
ROUTE_CACHE_TTL_SECONDS = 300
ROUTE_CACHE_MAX_ENTRIES = 2048
_route_distance_cache: dict[tuple[float, float, float, float], tuple[float, float]] = {}


def parse_openrouteservice_distance_km(payload: Any) -> Optional[float]:
    """Extract the route summary distance from an ORS GeoJSON response."""
    if not isinstance(payload, dict):
        return None
    try:
        if "routes" in payload:
            distance_meters = float(payload["routes"][0]["summary"]["distance"])
        else:
            distance_meters = float(payload["features"][0]["properties"]["summary"]["distance"])
    except (IndexError, KeyError, TypeError, ValueError):
        return None
    if not math.isfinite(distance_meters) or distance_meters < 0:
        return None
    return round(distance_meters / 1000.0, 2)


async def calculate_driving_distance_km(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
    api_key: Optional[str] = None,
) -> Optional[float]:
    """Return driving distance in km; return None if routing is not configured or fails."""
    key = api_key if api_key is not None else os.environ.get("OPENROUTESERVICE_API_KEY", "")
    key = str(key).strip()
    if not key:
        return None

    try:
        coordinates = tuple(float(value) for value in (origin_lat, origin_lng, destination_lat, destination_lng))
    except (TypeError, ValueError):
        return None
    origin_lat_value, origin_lng_value, destination_lat_value, destination_lng_value = coordinates
    if not all(math.isfinite(value) for value in coordinates):
        return None
    if not (-90 <= origin_lat_value <= 90 and -90 <= destination_lat_value <= 90):
        return None
    if not (-180 <= origin_lng_value <= 180 and -180 <= destination_lng_value <= 180):
        return None

    cache_key = tuple(round(value, 5) for value in coordinates)
    now = time.monotonic()
    cached = _route_distance_cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]
    if cached:
        _route_distance_cache.pop(cache_key, None)

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.post(
                OPENROUTESERVICE_DIRECTIONS_URL,
                headers={"Authorization": key},
                json={"coordinates": [[origin_lng_value, origin_lat_value], [destination_lng_value, destination_lat_value]]},
            )
            response.raise_for_status()
            distance_km = parse_openrouteservice_distance_km(response.json())
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning("OpenRouteService road-distance lookup failed (%s)", type(exc).__name__)
        return None

    if distance_km is None:
        return None
    if len(_route_distance_cache) >= ROUTE_CACHE_MAX_ENTRIES:
        for old_key, (expires_at, _) in list(_route_distance_cache.items()):
            if expires_at <= now:
                _route_distance_cache.pop(old_key, None)
        if len(_route_distance_cache) >= ROUTE_CACHE_MAX_ENTRIES:
            _route_distance_cache.pop(next(iter(_route_distance_cache)))
    _route_distance_cache[cache_key] = (now + ROUTE_CACHE_TTL_SECONDS, distance_km)
    return distance_km
