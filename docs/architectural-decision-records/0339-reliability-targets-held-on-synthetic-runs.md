# 0339. Reliability targets per journey, held on synthetic runs

- Status: Proposed, in the reliability PR; accepted when the maintainer approves the targets and merges it.
- Date: 2026-11-25
- Decider: the maintainer set the bar on 2026-11-25 ("Bluebird has to work as well as google.com does"); the targets themselves are proposed for approval
- Issues and PRs: #934, #287
- Cited in code as: record 0339
- Guide: [`docs/RELIABILITY.md`](../RELIABILITY.md), Targets

## Context

Nothing defined what "working" meant, so nothing could say whether Bluebird Forecast was. On 2026-11-25 the maintainer set the bar: every analysis works, every time, without minutes of retries, and no provider being down for days or weeks stops it. Production measured that day: no pod 5xx in 30 days, discovery at 0.41 s at the 99th percentile, and about 50 analyses a month. No metric recorded how a browser run ended.

## Decision

- Targets are per journey, over a rolling 28 days: opening the site (99.95%, 3 s to a map you can draw on), running an analysis (99.9%; 8 s at the 95th percentile and 20 s at the 99th up to 200 destinations over 3 days, 45 s at the cap, never past 30 s or 90 s), running again inside the minute, opening a shared link, and shipping a fix (99% inside 30 minutes of merge).
- Four targets are not percentages: the numbers match Open-Meteo's own for the same model run; the model run is no older than twice its update interval; no single provider's outage stops an analysis; and the database restores to within a day, inside an hour, rehearsed quarterly.
- A cancel after the latency target is a failure. A table with an N/A column is a degraded success, tracked as its own share. A refusal for the hour's quota counts. A reader's own dead network does not.
- The targets are held on synthetic runs, an outside analysis every five minutes against Bluebird Forecast's own weather copy, because 50 real runs a month cannot measure 99.9%. Each real run's report is the diagnostic.
- A spent budget makes the next change a reliability fix.

## Evidence

- 2026-11-25, Prometheus: `/api/destinations` p50 0.019 s, p95 0.098 s, p99 0.41 s over 30 days; no 5xx; 47 web-app discoveries in 30 days.
- 2026-11-25, a review against the Google SRE Workbook's chapter on alerting on SLOs for low-traffic services: 8,000 synthetic runs in 28 days give a budget of eight failures.

## Consequences

- The browser reports each run's outcome to the pod, so the privacy page's account of what is counted changes with it.
- The synthetic probe, the burn-rate alerts and the outside heartbeat live in the deployment, outside this repository.
