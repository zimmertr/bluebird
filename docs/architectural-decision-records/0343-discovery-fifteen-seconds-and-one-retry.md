# 0343. A ring's discovery gets twenty-two seconds and one retry, and an edge answering for the pod says Bluebird Forecast is offline

- Status: Proposed, in the reliability PR; accepted when the maintainer merges it.
- Date: 2026-11-25
- Decider: the maintainer, in the reliability plan's mitigation 8 ("a 15 s deadline and one retry in place of 110 s and none, and the pod named rather than OpenStreetMap when the edge answers `502` or `530`")
- Issues and PRs: #579, #580, #760, #1001
- Cited in code as: record 0343
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `apiFetch.ts` and `analysisPipeline.ts`; [`docs/TRAFFIC.md`](../TRAFFIC.md), Inbound; [`docs/RELIABILITY.md`](../RELIABILITY.md), Mitigations

## Context

An analysis over a ring asks `POST /api/destinations` once, with the 110 s `API_DEADLINE_MS` and no retry (audit of main at 86e397f6, 2026-11-25). When the pod or the tunnel is down, Cloudflare answers with a `502` or a `530` and an HTML page of its own. `readErrorBody` read any `502` with no `detail` as `OpenStreetMap is not available. Try again later.`, which blamed a provider that was fine, and a `530` as `Something went wrong. Try again later.`

## Decision

- A ring's discovery for an analysis (`discoverDestinations`) gets `DISCOVERY_DEADLINE_MS`, 22 s, to start answering: the pod's own discovery deadline of 20 s (record 0346) and two seconds for the trip. The plan's mitigation 8 said 15 s, which was written before the pod's deadline was set, and a browser that gives up first would ask again behind a search the pod is still allowed to finish.
- It is asked once more, at once, after no answer at all (a dropped connection or the deadline) or after a `502`, `503`, `504` or `530` whose body is not the pod's own.
- The pod's own body is the one with an `error` object carrying `code` and `retryable` (`isOwnError`), which every failure the pod writes has. The pod's own answer is kept whatever its status and not asked again: it has already tried its places table and Overpass behind it, and a second ask would spend the same again.
- A `502` or `530` without that object reads as `API_UNREACHABLE_MESSAGE`, `Bluebird Forecast is offline. Try again later.`, an approved sentence. A `504` without it keeps `OpenStreetMap is not available. Try again later.`, and a `502` the pod wrote keeps its own `detail`.
- The count ahead of Analyze and the custom list's call keep `postDestinations` and its 110 s: both are best effort, and neither fails a run.

## Evidence

- 2026-11-25, Prometheus: `/api/destinations` p50 0.019 s, p95 0.098 s, p99 0.41 s over 30 days, answered from the places table. Twenty-two seconds is about 54 times the 99th percentile.
- The pod's own Overpass fallback can take up to 55 s today (`docs/RELIABILITY.md`, Finding Destinations). Mitigation 7 brings the pod's whole discovery under 20 s (record 0346), which is what this deadline is set past.

## Consequences

- The longest a hung pod holds an Analyze at discovery is 44 s, down from 110 s.
- A reader whose ring meets a dead pod is told the site is offline rather than that OpenStreetMap is.
