# 0346. The pod skips a database that stopped answering, bounds every call to it, and discovery has one deadline

- Status: Proposed, in the reliability PR; accepted when the maintainer approves it and merges it. Amends [0175](0175-shared-cache-in-postgresql.md)
- Date: 2026-11-25
- Decider: proposed by the reliability plan's mitigation 7 (`docs/RELIABILITY.md`), for the maintainer (TJ)
- Issues and PRs: #1001; #760 for the shared cache it hardens
- Cited in code as: record 0346
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/db/`, `ratelimit/shared.py`, `routes/destinations.py` and `services/osm/` bullets; [`docs/TRAFFIC.md`](../TRAFFIC.md), the Overpass row; [`docs/DATA.md`](../DATA.md), Overpass

## Context

Record 0175 made the database optional: a call it cannot answer takes the per-pod path. The audit of main on 2026-11-25 found three ways that promise still cost the reader. A database that stopped answering added the pool's 5 s wait to every request until it came back. A half-open connection had no bound at all, because the server's own timeout cannot fire on a server that is gone. And a statement the database refused raised past the handlers that only caught connection errors, so `POST /api/destinations` answered `502` rather than falling to Overpass. Worst case, discovery could run 222.5 s, mostly in serial Overpass attempts.

## Decision

- **A breaker.** A pool timeout, a broken connection or a call past its deadline pauses every caller on the pod for 30 s (`PAUSE_S`), then one call probes. A statement past its timeout does not pause anything, because one oversized query is not a database in trouble.
- **Bounds on every call.** Each connection carries a 3 s `statement_timeout`, a 3 s connect timeout and TCP keepalives, unless `DATABASE_URL` names its own, and each call a 5 s deadline on the pod. Migrations, the refresh, the day-file writes, the snow fill and the snapshots pass `unbounded` and bound themselves.
- **One error for the caller.** Every `psycopg.Error` surfaces as `DatabaseUnavailable`, and a refused statement is logged with its traceback as a bug.
- **One discovery deadline.** `POST /api/destinations` gives discovery and the elevation lookup 20 s together (`DISCOVERY_DEADLINE_S`), from when the address's discovery slot is held. Through Overpass it asks both mirrors at once and takes the first good answer, a mirror that failed in the last two minutes held back until the other fails. The browser's deadline is this plus two seconds (record 0343).

## Evidence

- Discovery from the places table: 0.41 s at the 99th percentile over the 30 days to 2026-11-25 (Prometheus). The 3 s statement timeout is about seven times that.
- overpass-api.de answered 93% of its successes inside 15 s (2026-09-30, `osm/mirrors.py`).
- Over the same 30 days the two Overpass mirrors answered 21 of 152 requests (`docs/RELIABILITY.md`, What the Evidence Shows).

## Consequences

- The race asks maps.mail.ru on every Overpass discovery, where failover asked it only after overpass-api.de failed, and a cancelled loser keeps its server busy until its own `[timeout:N]`. `docs/DATA.md` no longer says a query nobody waits for never holds an operator's slot. Accepted because Overpass is only the fallback for a search the table could not answer.
- The race records no failover, so the Overpass failovers panel in `docs/CICD.md`'s observability table reads lower than before.
- The analyze routes keep the in-turn failover and its per-mirror 25 s.
