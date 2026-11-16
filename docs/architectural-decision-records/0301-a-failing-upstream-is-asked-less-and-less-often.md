# 0301. A failing upstream is asked less and less often, and NSIDC slowly

- Status: Accepted. Amends [0295](0295-snow-depth-returns-beside-snowfall.md) (the backfill's pace)
- Date: 2026-11-16
- Decider: the maintainer (TJ), 2026-11-16: "Backoff PR only", with no email to NSIDC, then "We should have backoffs on all of them so as not to bully them"
- Issues and PRs: #849, #921, #943, #947
- Cited in code as: #849
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/db/`, `app/routes/geocode.py`, `app/services/snapshot.py`, `app/services/snodas.py` and `app/services/snow_history.py` bullets; [`docs/TRAFFIC.md`](../TRAFFIC.md), Outbound

## Context

The first production snow depth backfill started 2026-11-14 at 02:46 UTC. It took 8 days a run every 5 minutes, up to 96 archives an hour of 5 to 40 MB each, a day after a rehearsal at production size and a month-long preview experiment, all from the same home address. By 07:04 UTC it had filled 261 days. From then on NSIDC refused every connection from that address, port 443 and port 80 alike, from the cluster and from the maintainer's Mac, while a phone on a cellular network loaded the site. Every resolver gave the same address, and a traceroute reached the University of Colorado's network before going silent, so the refusal is NSIDC's edge and not DNS or the home router.

While refused, the deployment kept asking. Each history run tried every day it wanted and counted as a success, so the next came round in 5 minutes, and each of the three pods retried today's grid every 5 minutes: about 15 connections every 5 minutes, about 4,000 a day. NSIDC publishes no rate, so what tripped the refusal (requests, bytes, or both) is unknown.

An audit of every other upstream the pod calls found three more places that kept asking a provider that had failed or refused:

- The shared refresh loop recorded an upstream's `Retry-After` and showed it, but scheduled the next try on its own backoff, so an ArcGIS quota that said an hour was asked again in a minute.
- A pod's own snapshot cache (no database, or the fire detections before their first row) waited a flat 60 s after every failure, however long the outage.
- Nominatim searches went out at the gate's full rate through any number of refusals, which its usage policy answers with a block.

## Decision

- **NSIDC, slower.** The backfill takes 5 days a run every 10 minutes, 30 archives an hour, so a fresh database fills a year in about twelve hours instead of four.
- **The snow history backs off.** A day past the two-day publishing grace that fails ends the run's downloads at once, and a run that recorded nothing and saw a failure raises it, so the refresh loop backs off. That backoff now takes a first wait and a ceiling per source (`refresh.Source.backoff_first_s`, `backoff_max_s`); the snow history's are 10 minutes and 6 hours. Every other source keeps a minute to an hour.
- **The refresh loop waits out `Retry-After`.** A failure that carries `retry_after_s` is not retried before it, whatever the backoff says.
- **Every snapshot cache doubles its failure wait.** Each failure in a row doubles the cache's first wait up to `MAX_RETRY_AFTER_FAILURE_S` (an hour), a `Retry-After` the upstream sent is waited out whole, and a success starts again from the first wait. The snow grid's ceiling is six hours.
- **Nominatim is held off after a failure.** A failed or refused search holds this pod's searches for a minute, doubling to an hour, or for Nominatim's `Retry-After` when that is longer. Each search meanwhile answers with the failure's own 502 and sends nothing.
- **Left as they were:** Overpass, whose failed mirror already goes to the back of the chain for 120 s and which the places table answers for in production; Open-Meteo, whose 429s are parsed and whose minutely, hourly and daily quotas are honoured, and whose browser retries are bounded at about a minute per analysis (record [0296](0296-outlast-a-stuck-open-meteo-host.md)); the OpenStreetMap replication, already on the shared backoff; the weekly planet fill, which never retries a failed Job (`backoffLimit: 0`); and the map's tiles, which MapLibre asks for once and does not retry.

## Evidence

- 2026-11-14 07:04 to 2026-11-16 00:55 UTC: every NSIDC request from the cluster failed with `ConnectError('')`. `curl` from the Mac: `Failed to connect to noaadata.apps.nsidc.org port 443 after 41 ms`, the same for `nsidc.org` on 443 and 80. The maintainer loaded the site on a phone on cellular, 2026-11-16.
- Under this change, a refusal that lasts a day costs the snow history about 4 attempts a run (the three days inside the grace and one older day) over about 9 runs, and each of three pods' grids about 10 attempts: about 70 in all, where it was about 4,000.
- The audit, 2026-11-16 against `main` at 0a40cd14, read each upstream's failure path in the code rather than in `TRAFFIC.md`.

## Alternatives rejected

- Emailing NSIDC user services to lift the block and name a rate: declined by the maintainer for now.
- Waiting with no change: the deployment would keep knocking at about 4,000 a day, which may be what holds the refusal in place.
- Today's grid read from the history table rather than downloaded by each pod: the table holds only the cells a place sits in, and a pasted coordinate can fall anywhere in the grid.
- A hold that stops every Overpass attempt once both mirrors have failed: in production the places table answers discovery, so Overpass is asked only when that table cannot answer, one discovery at a time per address, and a hold would fail those analyses outright during the busy spells the 120 s reordering already rides out.
- Sharing the Nominatim hold through the database: per pod, ten replicas send at most ten searches a hold, and a search is a visitor's own press.

## Consequences

A fresh database takes about twelve hours to hold a year. After NSIDC comes back, the history can wait up to six hours before it asks again, and so can today's grid on each pod, so the newest depth can arrive hours after 13:15 UTC. The last good grid keeps serving meanwhile, and the history answers in its place. If NSIDC answers an unpublished file with a dropped connection rather than a 404, as it did on 2026-11-14 shortly before the refusal, a run with nothing older to fill backs off on it too, and that day's depth can arrive up to six hours late.

An overlay whose upstream stays down is retried once an hour per pod rather than once a minute, so it can come back up to an hour after its upstream does. While the database is up, that was already true of the shared refresh. A Nominatim failure fails every search on that pod for at least a minute, a timeout included, where it used to fail one.
