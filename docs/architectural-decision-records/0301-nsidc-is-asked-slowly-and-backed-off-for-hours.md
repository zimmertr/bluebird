# 0301. NSIDC is asked slowly, and backed off for hours when it cannot be reached

- Status: Accepted. Amends [0295](0295-snow-depth-returns-beside-snowfall.md) (the backfill's pace)
- Date: 2026-11-16
- Decider: the maintainer (TJ), 2026-11-16: "Backoff PR only", with no email to NSIDC
- Issues and PRs: #849, #921, #943
- Cited in code as: #849
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snow_history.py`, `app/services/snodas.py` and `app/db/` bullets; [`docs/TRAFFIC.md`](../TRAFFIC.md), the NSIDC SNODAS row

## Context

The first production backfill started 2026-11-14 at 02:46 UTC. It took 8 days a run every 5 minutes, up to 96 archives an hour of 5 to 40 MB each, and it came a day after a rehearsal at production size and a month-long preview experiment, both downloaded from the same home address. By 07:04 UTC it had filled 261 days. From then on NSIDC refused every connection from that address, port 443 and port 80 alike, from the cluster and from the maintainer's Mac, while a phone on a cellular network loaded it. Every resolver gave the same address, and a traceroute reached the University of Colorado's network before going silent, so the refusal is NSIDC's edge and not DNS or the home router.

While refused, the deployment kept asking. Each history run tried every day it wanted and counted as a success, so the next came round in 5 minutes, and each of the three pods retried today's grid every 5 minutes: about 15 connections every 5 minutes, about 4,000 a day. NSIDC publishes no rate, so what tripped the refusal (requests, bytes, or both) is unknown.

## Decision

- The backfill takes 5 days a run every 10 minutes, 30 archives an hour, so a fresh database fills a year in about twelve hours instead of four.
- A day past the two-day publishing grace that fails ends the run's downloads at once. A run that recorded nothing and saw a failure raises it, so the refresh loop's backoff applies. That backoff now takes a first wait and a ceiling per source (`refresh.Source.backoff_first_s`, `backoff_max_s`), and the snow history's are 10 minutes and 6 hours, shared by every pod through `refresh_state`.
- Each pod's grid cache doubles its failure wait from `SNODAS_RETRY_AFTER_FAILURE_S` up to six hours (`SnapshotCache`'s `max_retry_after_failure_s`), and a success starts it again from the first wait. The other overlays keep their flat wait.

## Evidence

- 2026-11-14 07:04 to 2026-11-16 00:55 UTC: every NSIDC request from the cluster failed with `ConnectError('')`. `curl` from the Mac: `Failed to connect to noaadata.apps.nsidc.org port 443 after 41 ms`, the same for `nsidc.org` on 443 and 80. The maintainer loaded the site on a phone on cellular, 2026-11-16.
- Under this change, a refusal that lasts a day costs the history about 4 attempts a run (the three days inside the grace and one older day) over about 9 runs, and each of three pods' grids about 10 attempts: about 70 in all, where it was about 4,000.

## Alternatives rejected

- Emailing NSIDC user services to lift the block and name a rate: declined by the maintainer for now.
- Waiting with no change: the deployment would keep knocking at about 4,000 a day, which may be what holds the refusal in place.
- Today's grid read from the history table rather than downloaded by each pod: the table holds only the cells a place sits in, and a pasted coordinate can fall anywhere in the grid.

## Consequences

A fresh database takes about twelve hours to hold a year. After NSIDC comes back, the history can wait up to six hours before it asks again, and so can today's grid on each pod, so the newest depth can arrive hours after 13:15 UTC. The last good grid keeps serving meanwhile, and the history answers in its place. If NSIDC answers an unpublished file with a dropped connection rather than a 404, as it did on 2026-11-14 shortly before the refusal, a run with nothing older to fill backs off on it too, and that day's depth can arrive up to six hours late.
