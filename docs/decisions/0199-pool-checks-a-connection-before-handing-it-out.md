# 0199. The app's pool checks a connection before handing it out

- Status: Accepted
- Date: 2026-10-20
- Decider: Claude, on 2026-10-20, after the first production fill failed on the mesh's idle timeout (#774, 0198's step 1), for the maintainer's review on the pull request.
- Issues and PRs: #760, #774
- Cited in code as: none
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/db/` bullet
- Related: 0175 (the shared cache, and the database's Istio sidecar), 0183 (previews read production's database), 0181 (what a shared check costs), 0198 (the fill's keep-alive, the same timeout)

## Context

The pod's pool (`backend/app/db/__init__.py`) keeps one connection open (`min_size=1`) and closes the rest ten minutes after their last use. The mesh's sidecars close a connection that has carried no bytes for an hour, Envoy's default, which is what ended the first planet fill (#774). A writable pod's refresh loop uses its kept connection every 30 s. A read-only preview (0183) runs no refresh loop, so its kept connection idles past the hour: the next request meets the dead connection, raises `DatabaseUnavailable` and takes its per-pod path, and only then does the pool replace it. The primary logged that reset for `user=bluebird_preview` at 21:46:54 on 2026-10-20.

## Decision

**The pool is built with `check=AsyncConnectionPool.check_connection`** (psycopg-pool 3.3.3). A connection that fails the check is discarded and the caller gets another, so no request pays for the mesh's timeout.

## Evidence

The check costs one round trip per checkout: 0.08 ms on a local PostgreSQL 17, the median of 5,000 checkouts (2026-10-20), about what a shared check costs (0181). Its cost through the cluster's two sidecars is not measured. `backend/tests/test_db.py` terminates every connection the pool holds with `pg_terminate_backend` and takes a connection again; without `check` the test fails with `DatabaseUnavailable`.

## Alternatives rejected

- **A longer idle timeout in the mesh.** A DestinationRule on the database's service would change it for every client to hide one idle connection.
- **`min_size=0`.** The kept connection is what makes a quiet pod's first request fast, and the first request after an idle hour would then pay a full connect.
- **Leave it.** One failed request per idle hour per preview, served from the per-pod path. A failure that 0.08 ms prevents.

## Consequences

Every checkout costs one round trip more. A preview's first request after a quiet hour answers from the database rather than its per-pod path.
