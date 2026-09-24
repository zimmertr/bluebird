# 0002. Upstream capacity is counted in weighted calls, never in HTTP requests

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 138

The Open-Meteo weighted-call formula is a third mirrored pair: `backend/app/services/openmeteo_weight.py` ↔ `callWeight` in `frontend/src/utils/openMeteo.ts`. Both take a model count, because a request naming several models returns one series per variable per model and Open-Meteo prices what comes back, so the variables factor is `max(1, variables × models / 10)`; every call site today spells the count rather than leaving it defaulted, so the multiplier is visible where `models=` is built.

## From `CLAUDE.md`, line 138

A ninth is how a weather fetch is batched and paced: `BATCH_SIZE`/`MAX_CONCURRENT_BATCHES` in `openmeteo_fetch.py`, the one pipeline both Open-Meteo services batch through, ↔ the same two names in `openMeteo.ts` — 50 locations a request and 4 requests in flight, measured rather than chosen (#182), so the browser cannot quietly batch larger than the pod proved polite (#434).

## From `CLAUDE.md`, line 138

**Those counts are over the floor now**: since #443 the factor is 1.5 in the browser and 1.4 on the pod, where every set before the five level temperatures rode inside 1. The browser reads its count off `HOURLY_VARIABLES.length` rather than spelling it again, because the request and its price must move together; the pod spells `N_VARIABLES = 14` and every capacity number that reads it moved with it (the worst-case 50-location 16-day batch went from 57.1 to 80.0 weighted calls). All capacity math is written in weighted calls (one location in a batch = one call), never HTTP requests — pricing spend in requests is the unit error behind the 2026-07-29 rate-limit incident (issue #180).
