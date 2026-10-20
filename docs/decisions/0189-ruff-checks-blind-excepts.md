# 0189. Ruff checks blind excepts: a broad catch re-raises, logs its traceback, or says why

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #688, 2026-10-18, answering the audit's question on broad catches: select ruff's `BLE` rules.
- Issues and PRs: #688, #379 (the rules in `backend/ruff.toml`), #PRNUM
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands, the sentence naming the selected rule sets; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), Where a source check lives

## Context

The backend held 17 `except Exception` clauses in 9 files (#688, measured 2026-10-08). The catches in `aggregation.py`, `snapshot.py` and `osm/mirrors.py` already carried `# noqa: BLE001` markers, but `BLE` was not selected, so the markers silenced nothing and a new broad catch needed none.

## Decision

`backend/ruff.toml` selects `BLE`. A broad `except` passes when it re-raises or logs the traceback; any other carries a `noqa: BLE001` with the reason beside it.

## Evidence

Selecting `BLE` at the audit's head, 2026-10-18, flagged one catch: the hand-off from `_fetch_forecasts` to `_upstream_failure` in `routes/analyze/phases.py`, which now carries its reason. Every other broad catch already re-raised, logged its traceback, or carried a marker.

## Alternatives rejected

- **Leave `BLE` off.** The markers stayed decorative, and the next broad catch arrived unexamined.
- **Narrow every broad catch to named exceptions.** The audit's sweep of the 20 broad catches found each one deliberate: a degrade boundary that must not fail an analysis, or a background refresh that must not die.

## Consequences

A new broad catch fails `make lint-backend` until it re-raises, logs, or says why.
