# 0002. Upstream capacity is counted in weighted calls, never in HTTP requests

- Status: Accepted
- Date: 2026-07-29 (git: the merge of #181). The guide dates the rate-limit incident to the same day.
- Decider: TJ (git: author and merger of #181)
- Issues and PRs: #180, #181, #182, #434, #443
- Cited in code as: #180, #181, #182, #434, #443
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "The Open-Meteo weighted-call formula" and from "A ninth is how a weather fetch is batched"

## Context

Open-Meteo bills weighted calls, not HTTP requests: one location in a batch is one call, each service has its own budget, and a request that returns more variables or more models costs more. On 2026-07-29 the pod priced its spend in requests and ran into Open-Meteo's rate limit (#180).

## Decision

All capacity math is written in weighted calls, never in HTTP requests. `openmeteo_weight.call_weight` and `openMeteo.callWeight` price a request with the variables factor `max(1, variables × models / 10)`, and every call site passes its model count so the multiplier is visible where `models=` is built. Both sides batch 50 locations a request with at most 4 requests in flight. The browser reads its variable count from `HOURLY_VARIABLES.length`, so the request and its price move together. The pod spells `N_VARIABLES = 14`, and every capacity number that reads it moves with it.

## Evidence

The 2026-07-29 incident (#180) was a unit error: spend priced in requests. The batch of 50 and the 4 in flight were measured, not chosen (#182). Since #443 the variables factor is 1.5 in the browser and 1.4 on the pod, where every variable set before the five level temperatures stayed inside 1. The worst-case 50-location 16-day batch went from 57.1 to 80.0 weighted calls.

## Alternatives rejected

- Counting HTTP requests: the unit error behind the incident.
- A browser batch larger than the pod's: the browser must not batch larger than the pod proved polite (#434).

## Consequences

The formula is mirror row 7, held by a comment and each side's own unit tests. `BATCH_SIZE` and `MAX_CONCURRENT_BATCHES` are mirror row 14, pinned by `mirrored_constants.json`. A new hourly variable changes the price, so it changes every capacity number.
