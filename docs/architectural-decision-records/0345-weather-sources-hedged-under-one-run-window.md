# 0345. Weather comes from a published list of sources, a slow request gets a second copy, and a run has one outage window

- Status: Proposed, in the reliability PR; accepted when the maintainer approves it and merges it. Supersedes [0296](0296-outlast-a-stuck-open-meteo-host.md)
- Date: 2026-11-25
- Decider: proposed by the reliability plan (`docs/RELIABILITY.md`), for the maintainer (TJ)
- Issues and PRs: #1001; #849, #545 and #921 for the behaviour it replaces
- Cited in code as: record 0345
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `openMeteo.ts` and `openMeteoSources.ts` bullets; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/open_meteo_sources.py` bullet; [`docs/TRAFFIC.md`](../TRAFFIC.md), the Open-Meteo forecast row; [`docs/RELIABILITY.md`](../RELIABILITY.md), mitigations 2 and 3

## Context

Every forecast an analysis needs came from Open-Meteo's three public hosts, and nothing else could answer. Record 0296 met a stuck host by asking each batch again after waits of 10, 20 and 30 s, about a minute per batch, with a 20 s deadline on every ask: a batch could hold the run for about 160 s, and a run whose batches failed one after another could wait that more than once. A `502` failed the run at once, with no retry at all. The plan's targets (`docs/RELIABILITY.md`, record 0339) are a ranked table in 8 s at the 95th percentile for 200 destinations and never past 30 s, and no outage of one provider stopping an analysis. Neither can be met while one host is the only answer, and the second can only be met by a second source (record 0340). That source does not exist yet; where it lives is the maintainer's decision. So this record builds the client that uses it, so that adding one is configuration rather than a release.

## Decision

- **A published list.** `/api/capabilities` publishes `open_meteo_sources`: the deployment's mirrors from `OPEN_METEO_MIRRORS` (comma-separated https origins, forecast and air quality, no archive, not paced), then Open-Meteo's public hosts, always last and the only entry when nothing is configured. The page's `connect-src` names the same mirrors. The browser asks the sources that answer an endpoint in that order.
- **Bounded retries.** A timeout, a dropped connection or a 5xx is asked of the same source once more at once (#545's retry, now for a 5xx too), then the next source is asked. A quota refusal moves to the next source; on the last one a minutely refusal is waited out once, as before. A cancel, a regional model's coverage refusal, an unreadable body and any other 4xx fail at once, because every source would say the same.
- **A hedge.** A request still out after its host's 95th percentile per place, scaled to the batch (5 s before five answers are measured, never under 2 s or over 8 s), gets a second copy to the next source, or to the same host when it is the only one, and the first answer wins. The copy takes the fifth request Open-Meteo admits per host, which the pool leaves free, and is sent only when that slot is free and a paced host can book it at once, so it never queues and never spends quota the pacer would have held. A run sends at most four. A request that was hedged is not also retried at once.
- **A breaker per host.** Two failures in a row move a host to the back of the order for a minute, and an answer moves it forward at once.
- **One outage window per run.** When every source has failed, the run spends one 30 s window asking again, after waits of 5, 10 and 15 s, counted down as before (`Open-Meteo is unavailable · retrying in Ns`). The window is the run's, shared by its weather, cloud and air-quality fetches, so it is spent once rather than once per batch.
- **A shorter deadline.** 12 s rather than 20 s, because the 19 s outlier that set it is now answered by the hedge.
- **Air quality asks each source once** and, as before, never waits; since this record it also stops at its first timeout, as it stopped at its first rate limit, so a stuck air-quality host holds the finished table for one deadline rather than one per round of batches.

## Evidence

- A 50-location forecast batch answered in 1.5 to 1.8 s with cold outliers of 7.7 s and 19 s in six tries (#545, 2026-09-30). The hedge's default of 5 s is about three typical batches.
- Open-Meteo admits five open requests per address per host and refuses the sixth (record 0203, 2026-10-21). The pool keeps four, which leaves the fifth for the hedge.
- On 2026-11-13 the forecast host hung for over a minute while the others answered (record 0296). With one source, the timeline for a host that never answers is now about 49 s (a first copy and its hedge timing out by 17 s, then the window), against about 160 s before; with a mirror it is the hedge's delay plus one batch.

## Consequences

- With only the public hosts configured, a run against a host that is down for longer than its window still fails, about 49 s in rather than 160 s. Only a second source removes that, which is the decision record 0340 leaves to the maintainer.
- A mirror's numbers can differ slightly from the public hosts' for the same hour, if it downloaded a run at a different time. Nothing keys the cache by source, so a field can mix the two. `docs/RELIABILITY.md` (The Mirror Must Prove It Is Right) is where the check that bounds this belongs.
- A mirror that lacks a model answers its own `400`, which this client reads as a coverage refusal and fails the run on. A mirror must carry every model the picker offers.
- The pod's own Open-Meteo path (keyed API callers) still asks the public or customer hosts alone.

## Alternatives rejected

- **Keeping 0296's minute per batch**: it is the "minutes of repeat waits" the maintainer named on 2026-11-25.
- **Failing at once with no window**: with one source, that turns every short blip into a failed run.
- **Hedging every request**: it doubles the quota a run spends, where four copies a run cover the slow tail.
