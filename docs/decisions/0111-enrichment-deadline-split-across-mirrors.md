# 0111. The elevation lookup splits its deadline evenly across the mirrors, and a cut attempt cools its mirror

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer, choosing #655's recommendation (options A, B and D together) for the fix pass. The 4 s and 4 s slices are the starting point the issue named, applied by Claude; the issue left the sizes to the maintainer, and the backup's is not measured
- Issues and PRs: #655, #545, #548, #630, #643
- Cited in code as: #655, #545
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` bullet

## Context

A pasted list's elevations come from one Overpass query that `enrich_custom` wraps in `ENRICH_DEADLINE_S`, 8 s (#545). The query goes through `_post_with_fallback`, the same mirror chain discovery uses, where each mirror's attempt may run its table timeout of 25 s. So the deadline always fired inside the first attempt: the backup mirror was never asked, and because the chain's `CancelledError` arm recorded nothing, the busy primary stayed first for the next list. Discovery never showed it, because its chain has the full 50 s. The outer deadline came in PR #548 without being reconciled with the per-mirror timeouts.

## Decision

- **A.** `_post_with_fallback` takes an optional `attempt_timeout_s` that replaces every mirror's `timeout_s` for one chain, in the attempt's `asyncio.timeout` total (#630) and in the `[timeout:N]` the query carries. The lookup passes `_attempt_timeout_s()`, which is `ENRICH_DEADLINE_S` over the number of mirrors: 4 s each with today's two. The 8 s deadline stays around the whole chain as its ceiling. Discovery passes nothing and keeps the table's 25 s.
- **B.** An attempt the caller's cancellation ends while its request is in flight records the mirror's failure for `MIRROR_COOLDOWN_S`, so the next chain starts on another mirror. It still counts no metric outcome and observes no duration. A cut while queued for the mirror's slot records nothing, the same as a budget shed, because nothing was asked.
- **D.** `bluebird_forecast_overpass_requests_total`, `bluebird_forecast_overpass_request_duration_seconds` and `bluebird_forecast_overpass_fallback_total` carry a `path` label, `discovery` or `enrichment`, set by the caller.

## Evidence

Measured 2026-10-06 with the bundled Smoot list (100 rows), from #655:

- Production pod logs, 20:44 to 22:29 UTC: three `gave up after 8s` lines for the list and no successes between them.
- `POST /api/destinations` with the list at 22:35: 200 in 8.3 s with 0 of 100 elevations. At 19:50 the same request answered in 1.2 s with 97 of 100.
- The lookup's query sent straight to each mirror at 22:50: overpass-api.de answered 504 after 11.4 s, then 200 in 1.0 s. maps.mail.ru sent nothing in 40 s twice, then 200 in 15.3 s.

The primary's 4 s rests on #545 (2026-09-30, 30 days of telemetry): 48% of its healthy answers under 5 s, and its "too busy" after 8 to 16 s. Nothing supports any number for the backup: its 30-day figure is "most under 15 s", and on 2026-10-06 it answered nothing inside 8 s in three tries. So the split does not, on its own, fill a list during a spell like that evening's. It asks the backup, which was never asked before, and the `enrichment` series are what will say whether 4 s is right for either mirror.

No busy spell was reproduced for this change; the tests stub both mirrors.

## Alternatives rejected

- **C, a second short attempt on the primary inside the same deadline.** Two 504-then-1 s pairs that evening suggest a retry often lands, but two pairs are not a distribution, and a second request to a donated server in its busy spell is the hedging #177 declined.
- **Unequal slices.** No measurement supports any particular split, and equal shares derive from the one measured constant.
- **Lengthening or shortening `ENRICH_DEADLINE_S`.** It was measured in #545, and the lookup runs beside the forecasts since #643, so it is the whole wait in the busy case.
- **Counting the cut as an outcome.** "error" would read as the mirror breaking, and the cut is the caller's deadline rather than an answer.

## Consequences

`tests/test_osm.py` holds it: a stalled primary is followed by the backup inside the deadline for a 100-row list, the next lookup after a busy primary starts on the backup, a cut cools its mirror and a cut while queued does not, the enrichment query asks for `[timeout:4]`, discovery keeps 25 s, and the metrics carry the path.

What it costs:

- With equal slices the last attempt usually ends on the 8 s ceiling a moment before its own slice, so a slow backup is never counted as a `timeout` on the `enrichment` path. Its cuts are read as the primary's `enrichment` failovers minus the backup's `enrichment` outcomes.
- When both mirrors fail, both are cooling and the chain returns to table order, so the next list starts on the primary again.
- A cancellation from anywhere, not only a deadline, now cools the mirror in flight: an analyze stream whose client goes away mid-discovery cools that mirror for two minutes.
- The new label adds series. The production dashboard's three Overpass panels sum `by (mirror, outcome)`, `by (mirror, le)` and `by (mirror)`, so they keep their shape and add the two paths together.
