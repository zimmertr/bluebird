# 0296. A stuck Open-Meteo host is waited out for about a minute before an analysis fails

- Status: Accepted. Amends the one retry #545 gave a timed-out batch
- Date: 2026-11-13
- Decider: the maintainer (TJ), on PR #921, 2026-11-13
- Issues and PRs: #849, #921, #545
- Cited in code as: #849
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `openMeteo.ts` bullet; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `usePacedFetch.ts` + `pacing.ts` bullet; [`docs/TRAFFIC.md`](../TRAFFIC.md), the Open-Meteo forecast row

## Context

Since #545 every Open-Meteo request has 20 seconds to answer (`REQUEST_DEADLINE_MS`), and a weather or cloud batch that runs past it is asked once more at once. A second timeout failed the analysis with `Open-Meteo took too long. Try again later.` On 2026-11-13 the forecast host stopped answering for over a minute while the archive and air-quality hosts answered in under a second. Every analysis failed, on production and on a preview, on wifi and on a phone, though the same request answered in 0.07 s a minute later. Analyze is the one retry (record 0169), so the reader's only remedy was to press it again until the host came back.

## Decision

A weather or cloud batch that times out or finds no host is asked again at once, as before, and if that fails the same way it is asked again after waits of 10, 20 and 30 seconds, about a minute in all, before the analysis fails with the same sentence. The wait is counted down in the analysis overlay and on the comparison's line as `Open-Meteo is unavailable · retrying in Ns` (the maintainer's wording, 2026-11-13), through the pacer's own countdown with a reason beside its seconds, so it never reads as the quota's `Open-Meteo quota · resuming in Ns`. The waits grow so a host coming back is not met by every batch at once. Nothing is charged again: a request that hung was never answered, and the pacer already booked the batch. Air quality still asks once, because it is best-effort and a retry would hold the ranking for a column it can do without.

## Alternatives rejected

- A paid Open-Meteo key as a fallback when the free host hangs: declined for now (the maintainer, 2026-11-13). A key cannot live in the browser, so it would send the fan-out back through the pod, and whether the customer hosts stay up when the free ones hang is unmeasured.
- Ranking the rows that did answer and leaving the rest `N/A`: declined for now; it changes what a failed analysis means.
- Waiting about 30 seconds or about two minutes: the maintainer chose about a minute.
- Self-hosting Open-Meteo: filed as deferred work, to take up only if the provider stays unreliable.

## Consequences

A run against a host that is down for good fails after about two and a half minutes rather than about 40 seconds: four more 20-second deadlines and a minute of waits. A cancel ends any wait at once. The server path's own retries are unchanged.
