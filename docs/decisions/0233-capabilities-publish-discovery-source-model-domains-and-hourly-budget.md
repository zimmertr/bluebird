# 0233. /api/capabilities publishes where discovery answers, each regional model's grid, and Open-Meteo's hourly budget

- Status: Accepted. Amends 0098 (its evidence called the candidate cap over 16 days the largest analysis the calendar offers, and the calendar reaches the archive's year).
- Date: 2026-10-27
- Decider: the maintainer (TJ), on issue #803, 2026-10-27: option B's count before Analyze only where the places table answers, publishing the regional domain rather than splitting the failing batch, and refusing a field past the hourly budget rather than capping the calendar's span
- Issues and PRs: #803
- Cited in code as: #803
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", the sentence after `coverage`; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/model_domains.py`, `app/routes/capabilities.py` and `app/services/openmeteo_weight.py` bullets

## Context

Issue #803's audit found three analyses the panel lets a reader build and the run then refuses after it has spent. A ring can find more destinations than the candidate cap, and nothing counts it before Analyze (D1). A field over a long window can cost more weighted calls than Open-Meteo's free tier allows in an hour, which the pod refuses on its own path (`_check_pacing`, [0074](0074-refuse-what-the-pacer-would-shed.md)) and the browser did not (D2). A ring or a list that crosses NOAA HRRR's grid fails its whole batch, because `/api/capabilities` said only `regional: true` (W8). The browser could refuse all three before Analyze if it knew three things the pod knows.

## Decision

`GET /api/capabilities` publishes three new fields, each required in the schema.

- `discovery_source`, `places` or `overpass`: whether `places.is_filled()` says the places table can answer a ring. Any way the database can be missing answers `overpass`, never an error ([0175](0175-shared-cache-in-postgresql.md)). The browser counts a ring with `POST /api/destinations` ahead of Analyze only while it says `places`, because Overpass is donated and a count there spends it. `useCapabilities` falls back to `overpass`.
- `forecast_models[].domain`: a GeoJSON MultiPolygon for a regional model, `null` for a global one. The shape is the one `coverage` already publishes ([0117](0117-layers-grey-outside-coverage.md)), so the browser casts against it with `pointInRing`. Only `gfs_hrrr` is regional. Its outline is computed in `backend/app/model_domains.py` from the grid definition NOAA's HRRR CONUS files carry (1799 by 1059 points 3 km apart, Lambert conformal tangent at 38.5 N, central meridian 97.5 W, first point 21.138123 N 122.719528 W, sphere of 6,371,229 m), through every 50th outermost grid point. A model with no domain the browser can read has no compiled fallback: Open-Meteo's own refusal stays the check, as before.
- `limits.open_meteo_hourly_calls`: Open-Meteo's free-tier budget for one hour from one address, in weighted calls (`FREE_TIER_HOURLY_CALLS` in `services/openmeteo_weight.py`). The browser refuses a field whose weighted cost is past it once discovery answers and before any forecast is fetched. The pod publishes it and does not enforce it: its pacer meters minutes, and its path is the exception. Because nothing on either side computes with a second copy, it is published only, not a mirrored constant: the hook's compiled fallback is the stand-in until the fetch answers, as the archive reach's is ([0006](0006-published-limits-at-runtime.md), mirror row 23).

This reverses one standing choice: the HRRR comment in `forecast_models.py` and `DATA.md` said the app ships no copy of HRRR's domain, because the grid is not a lat/lon rectangle and a copy would drift. The pod's own path still lets Open-Meteo decide.

## Evidence

- Five single-location `models=gfs_hrrr` requests to Open-Meteo on 2026-10-27, on the grid's north edge at about 113 W in Alberta. Two inside answered with every hour present, and Open-Meteo moved each to a point the grid definition puts on node (535, 1053) and on (535, 1058), the last row, within 0.02 of a cell (about 60 m). Three answered `No data is available for this location`: 0.8 of a cell past the last row, 5 cells past it, and Edmonton, 67 cells past it. So Open-Meteo serves exactly NOAA's grid, its outermost row included. The model's comment had said Edmonton answers, which was wrong.
- The corners the definition gives are the ones quoted for the grid: 21.14 N 122.72 W, 21.14 N 72.29 W, 47.84 N 60.92 W, 47.84 N 134.10 W.
- A ray cast reads straight lines where the grid's edges curve. With a vertex every 50 grid points the worst chord stands 0.10 of a cell outside the grid, inside the half cell Open-Meteo still rounds onto the last row; every 100 it was 0.40 (measured 2026-10-27). The outline has 117 positions.
- The hourly budget was 5,000 weighted calls on 2026-10-27, from Open-Meteo's published terms (600 a minute, 5,000 an hour, 10,000 a day per address); `GET /api/capabilities` publishes today's value. Only the minute bucket has been measured ([0203](0203-four-open-requests-per-open-meteo-host.md)). The issue's own arithmetic put the reported case at about 6,794 weighted calls.

## Alternatives rejected

- Splitting a failing HRRR batch and keeping the covered rows (#803 W8's second option): more upstream spend to learn which location was outside, and a compare would still drop lines for covered rows.
- A lat/lon box for HRRR: the grid's north edge runs from 47.8 N at its corners to 52.6 N at 97.5 W, so one top latitude is wrong somewhere along it by up to 4.8 degrees. Banff (51.2 N) is inside and Port Hardy (50.7 N 127.5 W) is not.
- A literal list of vertices in source, as `wfigs_coverage.py` keeps: the grid definition is seven numbers NOAA publishes, and computing from them is checkable where a list of 117 positions is not.
- Capping the calendar's span instead of refusing a costly field (#803 D2): it would refuse a small analysis that is cheap at any length.
- Making the pod enforce the hourly budget: not asked, and its path is the exception the browser-first split already accepts (`ratelimit/upstream.py`).

## Consequences

`test_capabilities.py` holds the three fields: the limits object whole, a domain for every regional model and none for a global one, and `overpass` with no database and with one that cannot answer. `test_model_domains.py` holds the outline's corners, its winding, every vertex on the grid's edge, the chord bound, and the probed points with a set of places either side. `useCapabilities.test.ts` holds the parse and its fallbacks, and `api-compat.ts` fails a renamed member. `discovery_source` can read `places` for up to about two minutes while a database that has just dropped sends discovery to Overpass (the fill state is cached a minute and the response is cached a minute), so a count in that window can spend Overpass, inside the destinations bucket. A future HRRR grid, or a new regional model, needs its own outline here before the browser can refuse it.
