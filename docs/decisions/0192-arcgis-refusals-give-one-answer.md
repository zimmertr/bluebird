# 0192. ArcGIS's two quota refusals give one answer: the feed's own sentence, and ArcGIS's Retry-After

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #688, 2026-10-18, answering the audit's question on ArcGIS refusals: one sentence for both, and honor ArcGIS's `Retry-After`.
- Issues and PRs: #688, #203 (the national wildfire snapshot), #550 (the closure feed), #PRNUM
- Cited in code as: none
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `arcgis.py` bullet

## Context

ArcGIS refuses an exhausted quota two ways: an HTTP 429, or an HTTP 200 whose body carries the refusal. The two answered one fact differently. The refusal inside a 200 raised the feed's approved sentence. The HTTP 429 reached the cold cache's 503 as a plain HTTP error, worded "NIFC (wildfire perimeters) is rate-limiting.", with a `Retry-After` of 60 whatever ArcGIS had sent.

## Decision

- `fetch_pages` in `arcgis.py` takes the caller's provider and sentence. An HTTP 429 raises the same `UpstreamRateLimited` that the refusal inside a 200 raises: "Wildfire data is rate-limited. Try again later." from `nifc.py`, or "Closure data is rate-limited. Try again later." from `usfs_closures.py`.
- Both carry ArcGIS's `Retry-After` when it sends one, and 60 seconds when it does not. The cold cache's 503 hands that wait on to the browser.
- An HTTP 503 from ArcGIS keeps `classify_http_error`'s wording, which the decision does not cover.

## Evidence

The four cases are pinned in `test_nifc.py` (`ARCGIS_REFUSALS`): a 429 with and without `Retry-After: 120`, and a refusal inside a 200 with and without it. Each answers the feed's sentence with 120 or 60.

## Alternatives rejected

- **Keep the generic wording for the HTTP 429.** One quota, two sentences, depending on which way ArcGIS chose to refuse.
- **A fixed 60-second wait.** It ignored the wait ArcGIS asked for.

## Consequences

The snapshot's own failure backoff is unchanged: it still retries a failed refresh on its own schedule, and a stale snapshot keeps serving while it does.
