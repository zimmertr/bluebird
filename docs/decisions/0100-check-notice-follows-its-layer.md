# 0100. A failed column check's notice shows only while its layer is on, and the check keeps asking

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), in the session that filed #642 (option A: only with the layer on)
- Issues and PRs: #642, #256, #275, #550, #580
- Cited in code as: #642
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useProximityCheck.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `fireProximity.ts` and `panelMessages.ts` bullets

## Context

The Wildfire (mi) and Closure columns each run a check per analysis (`useFireProximity`, `useClosureProximity`), whether or not the matching map layer is on. When a check failed, the panel showed its sentence below Analyze on that status alone: `NIFC is unreachable, so wildfire proximity data is unavailable.` or `The Forest Service is unreachable, so closure data is unavailable.`

The maintainer reported two faults on production on 2026-10-06. The wildfire sentence appeared after an analysis with the Wildfires layer off, where the reader had asked for no wildfire data on the map. And it stayed after the layer was ticked and the perimeters drew, because the layer's fetch and the check are two requests and nothing connected them. Behind the second fault was a third: a check that failed never asked again. A 429 or a 503 ended it on the first answer, any other failure after three tries about four seconds apart, and it then held `unavailable` until the next Analyze.

## Decision

- The panel's sentence about a failed check is due only while the layer that draws the same data is on: the Wildfires layer for the wildfire check, the area closures layer for the closure check. `checkNoticeDue` in `utils/fireProximity.ts` is the one spelling, and `AppDrawer.tsx` asks it for both. The check itself still runs on every analysis, layer on or off, and a failed check still reads `N/A` in its column with the same sentence as hover text.
- A check that gave up keeps asking. After a failure that named a wait (the pod's `Retry-After` on a 503 or a 429) it asks once when that wait runs out. After one that named none it asks once a minute. It also asks when the browser comes back online, never inside a wait the pod named. These attempts are single and silent: the status stays `unavailable` until one lands, then becomes `ready`, which fills the column and clears the sentence.
- Switching the layer on asks a failed check again at once, as `loading` and with the three quick tries, so the sentence does not flash between the switch and the answer.
- Both checks run this one lifecycle, `useProximityCheck`. Each keeps only its own feed and test.

## Evidence

Measured 2026-10-06. Prometheus over 7 days of production pods: `/api/wildfires` answered 200 about 122 times and 503 zero times, with no throttled request counted, so the pod did not refuse the maintainer's request. One analysis on production the same day (a ring near North Bend, Wildfires layer off) got 200 on both checks and showed no sentence. The status the maintainer's browser received was not identified: Cloudflare can answer before the pod sees a request, and the API token on hand could not read the zone's analytics. Every failure path ended in the same held `unavailable`, which is what the decision removes.

## Alternatives rejected

- Keep the sentence on the check's status alone and only add the retries. A failed safety check would always be announced, but a reader who never asked for wildfire data would still get an error about it. Offered to the maintainer and declined.
- Gate the sentence on the column being shown in the Columns picker. It follows the thing the sentence describes, but the column is on by default, so almost nothing would change. Offered and declined.
- Let a layer fetch that lands mark the check as answered. The two requests cover different boxes (the viewport, the candidate field), so one cannot stand in for the other.
- Return to `loading` on every later attempt. The cells and the sentence would blink once a minute through an outage.
- Retry a 429 or a pod 503 on the quick backoff. Neither clears inside it (#180), and the pod names the wait.

## Consequences

`useProximityCheck.test.tsx` holds the lifecycle: the wait, the minute, the reconnect, the silence, and the layer switch. `fireProximity.test.ts` holds `checkNoticeDue`, and `AppDrawer.test.tsx` that each sentence follows its own layer and not the other's. With the layer off, a real outage is quiet in the panel: the column's `N/A` cells are the only sign, and their hover text does not exist on touch. A tab left open through an outage asks each feed once a minute, which the pod answers from its own backoff without an upstream request.
