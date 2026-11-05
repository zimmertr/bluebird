# 0010. The Open-Meteo services share one HTTP client, and a batch stays at 50 locations

- Status: Accepted
- Date: 2026-07-31 (git: the merge of #223)
- Decider: TJ (git: author and merger of #223)
- Issues and PRs: #182, #223, #388, #421
- Cited in code as: #182, #388
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/http.py` bullet

## Context

httpx pools connections per client. A client built inside the chunk loop threw its pool away and paid a new TCP and TLS handshake for every batch.

## Decision

One `httpx.AsyncClient` serves the Open-Meteo services (forecast, archive, air quality, and their customer twins), and the app's lifespan closes it. The same module holds the one `USER_AGENT` and `HEADERS` that every fetching module sends (#388). The shared client itself sends no User-Agent to Open-Meteo. A batch stays at 50 locations.

## Evidence

Measured 2026-07-31: about 540 ms lost per batch (720 ms per request cold, 178 ms warm). Batch size was measured and left at 50 (#182): weight is per location, so a bigger batch buys no throughput under the pacer, and Open-Meteo's nginx caps the request URI at 8,192 bytes, which 250 locations of 7-decimal coordinates already fill to 7,485.

## Alternatives rejected

- A client for each batch: the handshake cost above.
- A larger batch: no throughput under the pacer, and the URI cap.
- A User-Agent on the Open-Meteo client: sending none is the existing behaviour, and not a thing to change quietly.

## Consequences

`routes/geocode.py` had drifted to a second spelling of the product; #388 gave it the one header. `BATCH_SIZE` is mirror row 14.
