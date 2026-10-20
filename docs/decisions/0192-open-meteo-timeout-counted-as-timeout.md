# 0192. An Open-Meteo timeout counts as `outcome="timeout"`, the Overpass counter's word

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #688, 2026-10-18, answering the audit's question on the Open-Meteo request counter.
- Issues and PRs: #688, #77 (the metrics), #630 (the Overpass attempt's own deadline), #PRNUM
- Cited in code as: none
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `openmeteo_fetch.py` bullet

## Context

`bluebird_forecast_openmeteo_requests_total` counted a read timeout, and the request's own total deadline, as `network_error`. The Overpass counter counts both kinds as `timeout`. One dashboard showed the two upstreams' slow answers under two words.

## Decision

A read timeout or the total deadline counts `outcome="timeout"` on the Open-Meteo counter. Every other network error still counts `network_error`.

## Evidence

Read 2026-10-18 in `Kubernetes-Manifests`: the only consumer of the counter is the Grafana panel "Open-Meteo attempts by outcome", which sums by `outcome` with no filter on its value. No alert and no canary gate reads it.

## Alternatives rejected

- **Keep `network_error`.** A timeout says the upstream was slow, a refused connection says it was gone, and the series could not tell them apart.

## Consequences

The panel grows a `timeout` series with no edit, and `network_error` drops by the same count from this release on.
