# 0078. A request timestamp means the instant it names: an offset is converted to UTC, and a naive stamp is read as UTC

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #564 ("honor offsets", option A, with no new message)
- Issues and PRs: #564
- Cited in code as: #564
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/models/` bullet, the sentence that begins "`window_within_servable_range` converts both ends"

## Context

`start_datetime` and `end_datetime` on `POST /api/analyze` are ISO 8601, and the field text said only that a naive timestamp is read as UTC. The pod read an offset two ways in one request. The horizon checks and `window_source` converted it to an instant with `_as_utc`; the fetch and the hour filter did not: `hour_param`, `_naive` and the AQI clamp dropped the zone and read the wall clock as UTC. A window sent at `-07:00` was classified by its instant and fetched seven hours early, and answered `200` with a different `precip_total_in`. A naive end beside an aware start passed validation and then raised a `TypeError` in the ordering guard, a `500`. The web app sends no window to the server, so only direct API callers met either (Round 5 readiness review, RC06-1, D2-2, D2-3, 2026-10-01).

## Decision

`AnalyzeRequest.window_within_servable_range` replaces both ends with `_as_utc(dt).astimezone(UTC)` before anything else reads them, the point-sample floor included. Every reader downstream (the horizon checks, `window_source` and the archive seam, `hour_param`, the aggregation's hour filter, the AQI clamp, the logged summary and the forecast cache key) therefore sees one aware UTC instant per end. An offset means the instant ISO 8601 says it does, a naive stamp is still read as UTC, and a mix of the two compares. Hours are Open-Meteo's UTC hours, so under an offset that is not a whole hour the hour sampled is the UTC hour the instant falls in.

## Evidence

Measured 2026-10-01 with the route driven through `TestClient` and only Open-Meteo stubbed (`test_analyze_input.py`): before the change, `15:00Z` to `18:00Z` sent `start_hour=…T15:00` and `08:00-07:00` to `11:00-07:00` sent `…T08:00`, with different bodies; after it, both send `…T15:00` and answer the same body on `/api/analyze` and `/api/analyze/stream`, and the second spelling is the first's forecast cache hit. A `Z` start with a naive end answers `200`, and a naive end before an aware start answers the ordinary `400` "The start date must be before the end date." on both routes, where each was a `500` before.

## Alternatives rejected

- Refuse a non-zero offset with a `422` (option B). No doubt about what a caller meant, but a stricter contract than ISO 8601 for no gain, and a new message to approve.
- Keep reading the wall clock as UTC and document it. Callers would have to know to strip their offsets, and the classification would still read the instant, so a window near the archive boundary could still be split by one reading and fetched by the other.

## Consequences

The browser already agreed: `parseIso` in `forecastWindow.ts` reads an offset as its instant and a naive string as UTC, so mirror row 15 needs no change, and the browser sends no window to the server in any case. A caller that sent offsets before this change and relied on the old wall-clock reading now gets the hours it named, which is the fix rather than a break, and shipped before the 1.0 tag. `test_window_offsets_are_converted_to_the_utc_instant` and its neighbours in `test_models.py` hold the conversion, and `test_analyze_input.py` holds what a caller sees.
