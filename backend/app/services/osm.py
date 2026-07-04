from __future__ import annotations

import logging
from typing import Any, Dict, List

import httpx

from app.models import DestinationType, GeoPolygon
from app.services.errors import UpstreamError, classify_http_error

log = logging.getLogger(__name__)

PROVIDER = "OpenStreetMap (Overpass)"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
HEADERS = {"User-Agent": "Bluebird/1.0 (bluebirdforecast.com; personal weather tool)"}

# Overpass QL templates per destination type.
# Peaks query uses nodes only — the vast majority of OSM peaks are nodes,
# and node-only queries are significantly faster on the public API.
_QUERIES: Dict[DestinationType, str] = {
    DestinationType.peak: """\
[out:json][timeout:60];
node["natural"="peak"]["name"](poly:"{poly}");
out;
""",
    DestinationType.trailhead: """\
[out:json][timeout:60];
(
  node["highway"="trailhead"]["name"](poly:"{poly}");
  way["highway"="trailhead"]["name"](poly:"{poly}");
);
out center;
""",
    DestinationType.lake: """\
[out:json][timeout:60];
(
  node["natural"="water"]["water"="lake"]["name"](poly:"{poly}");
  way["natural"="water"]["water"="lake"]["name"](poly:"{poly}");
  relation["natural"="water"]["water"="lake"]["name"](poly:"{poly}");
);
out center;
""",
}

_IMPLEMENTED = {DestinationType.peak}


def _polygon_to_overpass(polygon: GeoPolygon) -> str:
    # GeoJSON coordinates are [lon, lat]; Overpass expects "lat lon lat lon ..."
    coords = polygon.coordinates[0]
    return " ".join(f"{lat} {lon}" for lon, lat in coords)


async def query_osm(
    polygon: GeoPolygon,
    destination_type: DestinationType,
    cap: int,
) -> List[Dict[str, Any]]:
    if destination_type not in _IMPLEMENTED:
        raise NotImplementedError(
            f"Destination type '{destination_type.value}' is not yet implemented."
        )

    poly_str = _polygon_to_overpass(polygon)
    query = _QUERIES[destination_type].format(poly=poly_str)

    log.info("Querying OSM Overpass for type=%s", destination_type.value)
    log.trace("Overpass query:\n%s", query)  # type: ignore[attr-defined]
    data = await _post_with_fallback(query)

    results: List[Dict[str, Any]] = []
    seen_names: set[str] = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name or name in seen_names:
            continue

        if element["type"] == "node":
            lat = element.get("lat")
            lon = element.get("lon")
        else:
            center = element.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")

        if lat is None or lon is None:
            continue

        elevation_ft: float | None = None
        ele = tags.get("ele")
        if ele:
            try:
                elevation_ft = round(float(ele) * 3.28084, 0)
            except (ValueError, TypeError):
                pass

        seen_names.add(name)
        results.append(
            {
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "elevation_ft": elevation_ft,
                "osm_id": f"{element['type']}/{element['id']}",
            }
        )
        log.trace("  OSM element: %s (%.4f, %.4f) ele=%s", name, lat, lon, elevation_ft)  # type: ignore[attr-defined]

        if len(results) >= cap:
            break

    log.info("OSM returned %d named destination(s)", len(results))
    return results


async def _post_with_fallback(query: str) -> Dict[str, Any]:
    last_exc: Exception = RuntimeError("No Overpass endpoints configured")
    async with httpx.AsyncClient(timeout=45.0, headers=HEADERS) as client:
        for url in OVERPASS_ENDPOINTS:
            try:
                log.info("Trying Overpass endpoint: %s", url)
                resp = await client.post(url, data={"data": query})
                resp.raise_for_status()
                log.info("Overpass query succeeded via %s", url)
                return resp.json()
            except Exception as exc:
                log.warning("Overpass endpoint %s failed: %s", url, exc)
                last_exc = exc
    raise last_exc
