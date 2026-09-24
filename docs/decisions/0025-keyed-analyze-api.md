# 0025. The analyze routes are public only to a caller with an Open-Meteo key

- Status: Accepted
- Date: 2026-09-11 (git: the merge of #320)
- Decider: TJ (git: author and merger of #320)
- Issues and PRs: #240, #317, #320
- Cited in code as: #240, #317
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The browser path is the only path", from "`POST /api/analyze` and `/api/analyze/stream` still exist"

## Context

After #240 the analyze routes answered a JSON 404 at the edge, so an API caller could not get a forecast (#317).

## Decision

The production gateway publishes the API by allowlist, and the analyze routes ride a narrower rule that matches only a request with the `X-Open-Meteo-Key` header. The header carries the caller's own Open-Meteo key, which the pod forwards to the customer hosts, so the fan-out spends the caller's quota and skips the pod's weighted pacer. The in-flight budget and the per-address bucket still apply. The header is optional in the code, because the gate is the edge.

## Evidence

Open-Meteo refuses a bad key with a 400 whose reason names it.

## Alternatives rejected

- A required header in the code: the Argo Rollouts release probe, PR previews, a port-forward and every self-hosted instance use the unkeyed free-tier path.
- Letting a bad key surface as a transient 502: `InvalidApiKeyError` answers 401.

## Consequences

The key joins no cache key, since both hosts answer the same numbers, and it must never reach a log line, a metric label or a message (`redacted_params` and `redacted_error` in `openmeteo_fetch.py`). `GET /api/capabilities` publishes the header's name as `api_key_header`.
