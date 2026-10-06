# 0098. An analysis is bounded by candidates times window hours, keyed or not, and the forecast cache by bytes

- Status: Proposed
- Date: 2026-10-06
- Decider: the maintainer (TJ), on issue #624 (option A plus the cache bound, as the issue recommends); the budget's value is the fix's proposal from the measurement below, and takes effect when the maintainer merges it
- Issues and PRs: #624, #595, #581, #317, #123, #323
- Cited in code as: #624
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/analyze/` bullet (`_check_pacing`), the `app/limits.py` bullet and the `app/services/cache.py` bullet

## Context

Every candidate's hourly series is held from the forecast fetch until the response is built, and each one is also stored in the per-location forecast cache for 15 minutes. Since the archive (#123) a window can run from a year back to the forecast horizon, about 390 days. The candidate cap (`MAX_ANALYZE_PEAKS`) bounds how many forecasts an analysis fetches, not how long each one is. The one bound on a long window was the unkeyed pacer refusal ([0074](0074-refuse-what-the-pacer-would-shed.md)), and a request carrying `X-Open-Meteo-Key` skips the pacer ([0025](0025-keyed-analyze-api.md)), so a keyed analysis of the candidate cap over the longest window ran unchecked. The forecast cache was bounded by entry count alone, with a comment sized for a 16-day window. The security review found both by arithmetic (#595, findings UF-1 and BR-11).

## Decision

`MAX_ANALYZE_DESTINATION_HOURS` in `backend/app/limits.py` bounds the candidate count times the window's hourly stamps (`window_hours`, both ends inclusive) for every server-side analysis, keyed or not. It is published by `GET /api/capabilities` as `limits.max_destination_hours`, so it is outside SemVer under [0076](0076-api-semver-strict-reader.md) and can move.

An analysis past it is refused by `_check_pacing`, after the candidate cap and before any forecast is fetched, with the pacer refusal's `400` unchanged: `error.code` `refusal`, the existing sentence (`This search covers {count} {noun}s over {days} days, which is too many for one analysis.`), `found`, and `limit`. The pacer bound and the budget are one check: `limit` is the most destinations the window can take under both at once, found by the same bisection, so a caller who sends that many is not refused again. Both analyze routes read it through `_run_analysis`.

The forecast cache is bounded by bytes as well as by count: `FORECAST_MAX_BYTES`, counted by `forecast_entry_bytes`. The least recently used entries go until both bounds hold, and an entry larger than the whole bound is not stored. An entry is counted from its series lengths times the most one hourly value was measured to cost, plus a fixed allowance for the aggregates, rather than walked, because a walk visits every value and an analysis stores three thousand entries on the event loop.

The browser does not read the budget. It fetches and holds its own forecasts and never calls the analyze routes (#240), so the budget bounds nothing it does.

## Evidence

Measured 2026-10-06 in the backend test container (`python:3.14-slim`), with the app's own aggregation over synthetic hours in which every value is present:

- One destination's held weather (aggregates plus series) over 9,407 hours, the longest window the request accepts: 1.40 MB for a window spanning the archive (its freezing level is null), 1.58 MB with every column present. `tracemalloc` and a recursive `sys.getsizeof` walk agreed within 0.1 %. The review's arithmetic (1.4 to 1.6 MB) holds.
- One keyed `POST /api/analyze` end to end, Open-Meteo answered by a `MockTransport` from prebuilt bodies with four batches in flight, series on and `limit` equal to the candidate count, peak RSS growth: 150 x 9,407 hours 563 MB; 200 x 9,407 728 MB; 400 x 9,407 1,301 MB; 800 x 9,407 2,506 MB, past the pod's 2 GiB limit; 1,500 x 1,000 608 MB; 1,500 x 385 (16 days) 289 MB. That is about 100 MB plus 320 bytes per destination-hour, so the candidate cap over the longest window needs about 4.6 GB. The figures include the test client's own copy of the response body (24 bytes per destination-hour).
- What an analysis leaves in the forecast cache: 2.24 MB per destination over 9,407 hours (weather and air quality), measured with `tracemalloc` at 200 destinations. Per entry: weather 67.5 KB over 385 hours and 1.58 MB over 9,407; air quality 26.5 KB and 0.50 MB.

The budget was set at 1,500,000 destination-hours on 2026-10-06; `GET /api/capabilities` publishes today's value as `limits.max_destination_hours`. One analysis at it peaks near 600 MB, under a third of the pod's limit, and the measured steady state of the pod (225 to 253 MiB, bluebird-helm `values.yaml`), a full forecast cache (256 MiB) and two analyses at the budget come to about 1.7 GB together. The largest analysis the app's forecast calendar offers, the candidate cap over 16 days (577,500), is well inside it, keyed or not.

## Alternatives rejected

- Capping the window span alone (option B): it limits a small analysis that is cheap at any length, where the product limits only what costs memory.
- Streaming the Open-Meteo body and refusing past a byte cap (option C): it bounds one batch's parse, not the series held across all of them. The budget bounds the parse too, since at most four batches of 50 are in flight and that is never more destination-hours than the analysis itself.
- A new refusal sentence or new remedy fields: the pacer refusal's sentence and its `found`/`limit` already say what is wrong and what fits, and a new sentence needs approval.
- Walking each cache entry to count its bytes exactly: tens of thousands of objects per entry over a long window, on the event loop.

## Consequences

`test_check_pacing_refuses_a_keyed_analysis_over_the_hour_budget` and its neighbours in `test_analyze_phases.py` hold the refusal and its `limit`, `test_a_keyed_analysis_over_the_hour_budget_is_refused_before_it_fetches` in `test_analyze.py` holds it on both routes, and `test_check_pacing_never_refuses_a_forecast_window` holds the 16-day case open with a key and without. `test_cache.py` holds the byte bound and holds `forecast_entry_bytes` above a walked entry. A keyed caller who used to get a year of 1,500 destinations in one request (or an OOM-killed pod) now gets a `400` naming how many fit, and splits the request. An analysis at the budget over a long window outgrows the forecast cache, so a repeat of it refetches its oldest entries. The bluebird-helm memory comment still describes a 16-day premise until its own PR re-derives it from these figures.
