# 0013. The calendar offers the dates that return data, not every date the API accepts

- Status: Accepted
- Date: 2026-08-01 (git: the merge of #231)
- Decider: TJ (git: author and merger of #231)
- Issues and PRs: #230, #231, #393, #426
- Cited in code as: #230, #393
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "`FUTURE_LIMIT_DAYS` in `frontend/src/utils/calendar.ts` is deliberately not this pattern" and from "`bandEnd` then walks back"

## Context

The range of dates Open-Meteo accepts is not the range it has data for. The calendar used to offer about 30 days of history that could only ever come back empty.

## Decision

The calendar is bounded by what the API answers with data. `FUTURE_LIMIT_DAYS = 15` is the forward accept edge. `PAST_DATA_DAYS` is the backward data edge, not the accept edge. `bandEnd` walks back one more day wherever a local 23:59 falls on the next UTC date, because every fetch sends UTC hour stamps and the API states its far limit as a UTC date. The backend's `PAST_LIMIT_SLACK_DAYS` and `FUTURE_LIMIT_SLACK_DAYS` are a looser backstop for a direct API caller near the edge, and since #393 `resolveWindow` refuses a window against the deployment's published pair.

## Evidence

Measured against the API rather than read off its docs (#230): "16 days" counts today, so today + 16 is a 400. The backward accept edge is 93 days, but past about 58 days every model answers 200 with an hourly array of nulls. `GET /api/capabilities` publishes the data edge as `limits.past_data_days` and the slack pair as `limits.max_past_days` and `limits.max_future_days`.

## Alternatives rejected

- The advertised one year back and about 16 days ahead: offers days that 400.
- The backend slack bounds: offers days that come back empty.

## Consequences

`FUTURE_LIMIT_DAYS` is the one limit nothing publishes and the backend does not hold, and it must not become a mirror. The far edge depends on the reader's time zone. Since #123 the data edge is a seam, not a wall: see [0027](0027-archive-endpoint-seam.md).
