# 0007. The pod holds one national wildfire snapshot and filters it per request

Verbatim guide text at 971fede, copied before the edit to the template.

## From `backend/CLAUDE.md`, line 45

- `app/services/nifc.py` — the national wildfire-perimeter snapshot behind `GET /api/wildfires` (issue #203). One paged ArcGIS query per fidelity (full-resolution for API callers, ~56 m simplified for the map picture and the proximity math — see the fireProximity bullet) covering the whole country with no geometry filter, which is both the smallest query to describe and the one that sidesteps the Aleutians straddling the antimeridian. Measured 2026-07-31 at 232 active fires: 16.5 MB full, 1.3 MB coarse, so the country fits in a pod and nothing keys on the caller's bbox. Features are held as the JSON text NIFC sent plus a per-feature bbox, because parsing 861k coordinates costs ~100 MB in Python and a viewport would then be a re-encode; a request is a filter and a join. `perimeter_cache()` returns a `SnapshotCache`, singleflight (`asyncio.Lock`) and **stale-tolerant**: an aged snapshot is served immediately and refreshed *behind* the request, since a cold fetch measured 6.7 s and no visitor should pay that to learn what the last one already knew. ArcGIS refuses an exhausted quota with **HTTP 200** and the error in the body, so `raise_for_status` learns nothing
