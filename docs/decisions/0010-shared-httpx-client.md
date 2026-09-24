# 0010. The Open-Meteo services share one HTTP client, and a batch stays at 50 locations

Verbatim guide text at 971fede, copied before the edit to the template.

## From `backend/CLAUDE.md`, line 41

- `app/services/http.py` — the one `httpx.AsyncClient` the Open-Meteo services share (forecast, archive, air quality, and their customer twins), closed by `main.py`'s lifespan, **and** the one `USER_AGENT`/`HEADERS` every fetching module sends (`osm/mirrors.py`, `nifc.py`, `hms.py`, and `routes/geocode.py`, which had drifted to a second spelling of the same product; #388). The shared client itself sends no User-Agent, which is Open-Meteo's existing behaviour and not a thing to change quietly. httpx pools connections per *client*, so a client built inside the chunk loop discarded the pool and paid a fresh TCP+TLS handshake every batch: measured 2026-07-31 at ~540 ms per batch (720 ms per request cold, 178 ms warm). Batch size is **not** the lever here and was measured and left at 50 (issue #182): weight is per-location, so bigger batches buy no throughput under the pacer, and Open-Meteo's nginx caps the request URI at 8,192 bytes, which 250 locations of 7-decimal coordinates already fills to 7,485
