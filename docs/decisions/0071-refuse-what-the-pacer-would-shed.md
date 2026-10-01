# 0071. An unkeyed analysis that its own batches would shed is refused before it spends

- Status: Accepted
- Date: 2026-10-01
- Decider: TJ (#581, item 2), who chose refusal over serving long windows slowly
- Issues and PRs: #581, #317, #123
- Cited in code as: #581
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/analyze/` bullet

## Context

The pod's weighted pacer sheds any acquire that would wait longer than `UPSTREAM_WEIGHT_MAX_WAIT_S` (120 s by default). An archive window prices each batch by its length: at the pod's fourteen variables a batch of 50 costs five weighted calls a day. Over a long enough window an analysis's own later batches queue past the bound on an idle pod, so the request spent its first batches and then answered `503` with a `Retry-After` that no retry could honour. The readiness review found it (#581, item 2).

## Decision

Before any forecast is fetched, `_check_pacing` runs an unkeyed analysis's planned weights (`weather.planned_weights`: the weather batches, and the cloud batches when the cloud column is fetched for every candidate) through `WeightedBudget.plan_max_wait_s`, a scratch copy of the pacer started idle, with every request taken to answer at once. If any acquire would wait past `UPSTREAM_WEIGHT_MAX_WAIT_S`, the analysis is refused with a `400` in the over-cap refusal's shape: `error.code` `refusal`, `found` the candidate count, and `limit` the most candidates that window can take, found by bisection. A keyed request is never checked, because it skips the pacer.

The threshold is the existing knob, not a new constant: the refusal and the shed are one rule. It is not published by `/api/capabilities`, because it is a function of the window and the count rather than one number; the refusal carries the number that applies.

## Evidence

Computed 2026-10-01 with the shipped planner against the token-bucket pacer at 550 a minute, archive windows, no cloud column (with it, in brackets): refused from 330 days at 50 destinations (178), 165 at 100 (89), 111 at 150 (60), 83 at 200 (45), 66 at 250 (36), and 55 days at 300 or more (30). The worst forecast window, 1,500 destinations over 16 days with the cloud column, is not refused.

## Alternatives rejected

- Splitting a long span into requests of 14 days or less, or bounding each wait: both serve the analysis slowly instead, and a large one costs several times the hourly quota (1,500 destinations over a year is about 54,750 weighted calls against 5,000 an hour), so it would fail on an hourly 429 after spending the pod's quota.
- A cap on an analysis's total weighted cost: the shed depends on the cost of one batch, not on the total. 250 destinations over 56 days (about 1,400) shed, where 1,500 over a 16-day forecast window (about 2,400) do not.

## Consequences

`tests/test_analyze_phases.py` holds the refusal, its `limit`, the keyed exemption, the forecast window and the cloud column, and that a refused analysis fetches nothing. The plan assumes an idle pod: a shed can still happen under other traffic, and that `503` is retryable. Every candidate is counted, cached or not, so the answer is the same on every retry.
