# 0075. The weighted pacer spends at most its budget in any 60 seconds, as a sliding-window log

- Status: Proposed
- Date: 2026-10-01
- Decider: Claude, in the pull request for #581, for TJ's review
- Issues and PRs: #581, #180
- Cited in code as: #581
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/ratelimit/` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `openMeteo.ts` bullet

## Context

Open-Meteo states its limit as 600 weighted calls a minute for each service and each address. Both pacers (`WeightedBudget` in `ratelimit/upstream.py` on the pod, and its twin in `openMeteo.ts` in the browser) were token buckets that started full at 550 and refilled at 550 a minute. An idle bucket can therefore spend about 1,100 in its first 60 seconds: 550 at once, then 550 more as it refills. That passes the provider's limit on any analysis worth more than 600 weighted calls, which is about 400 candidates in the browser. `docs/TRAFFIC.md` described it as "~550 weighted/min", which it was only on average. The readiness review found it (#581, item 9).

## Decision

Each pacer keeps a log of what it booked: each booking has a start time, the time it leaves the window, and a weight. An acquire books the earliest start, no earlier than the booking before it, at which the new booking and every booking still in the window fit under the budget. Then it sleeps until that start. A booking leaves the window 60 seconds after its start. A booking larger than the whole budget starts only when nothing else is booked, and it holds the window for `weight / budget` minutes, so the average spend stays at the budget. The pod sheds an acquire whose wait would pass `UPSTREAM_WEIGHT_MAX_WAIT_S`, and the shed books nothing. The browser has no shed. The budget is still 550 on both sides.

## Evidence

Simulated 2026-10-01 against the two algorithms, with the pod's batching (50 a batch, 4 in flight, 2 s a request) and the weights `call_weight` gives:

| Case | Token bucket (before) | Sliding window |
|---|---|---|
| Most spent in any 60 s, from idle | about 1,100 | 550 |
| An analysis worth 550 or less | instant | instant |
| Browser, 1,500 candidates over 16 days (2,571 weighted) | about 204 s | about 244 s |

The longer worst case is the cost of staying under the limit. The token bucket was faster because it spent past the limit.

## Alternatives rejected

- A token bucket whose burst plus one minute of refill is 550, for example a burst of 275 and a refill of 275 a minute. Simple, but every split loses somewhere. A small burst makes every small analysis wait: a burst of 50 cannot hold one 80-weight batch, and `test_default_budget_clears_a_worst_case_batch_without_pacing` holds that one batch must pass an idle pod. A half split makes every large analysis wait about twice as long: a 946-candidate browser analysis goes from about 95 s to about 250 s. On the pod, a half split also halves the window length at which a long archive analysis sheds (from 56 days to 28 for more than 250 destinations). The sliding window keeps the full burst and the full rate.
- Leaving the bucket and lowering the budget: the same loss as a split, with no gain.

## Consequences

`test_weighted_budget.py` holds the pod's pacer: a run of acquires never books more than the budget into any 60 seconds, and the oversized and backwards-clock cases. `openMeteo.test.ts` holds the browser's: a second batch after a full minute waits for the first to leave. The two are a mirror held by comments and each side's own tests (root `CLAUDE.md`, the mirrors table, row 33).

The window packs whole batches, so it loses throughput when a batch costs close to half the budget. Past 55 days of archive window, a pod batch of 50 costs more than 275, only one fits in any 60 seconds, and an unkeyed analysis of more than 150 destinations would shed on every retry, so record 0074 refuses it up front. The refusal threshold therefore moves with this record. Computed 2026-10-01 with `plan_max_wait_s` against each pacer at 550 a minute, archive windows, the first window length refused, no cloud column (with it, in brackets):

| Destinations | Token bucket | Sliding window |
|---|---|---|
| 50 | 330 (178) | never (221) |
| 100 | 165 (89) | 221 (60) |
| 150 | 111 (60) | 111 (60) |
| 200 | 83 (45) | 56 (39) |
| 250 | 66 (36) | 56 (30) |
| 300 or more | 56 (30) | 56 (30) |

So the sliding window refuses more at 151 to 299 destinations (from 56 days where the bucket refused from 66 to 83) and less at 51 to 100. No forecast window is refused under either.
