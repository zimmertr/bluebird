# 0057. The cloud column is fetched only when a ranking or a bound names it

- Status: Accepted
- Date: 2026-09-23 (git: the merge of #483)
- Decider: TJ (git: author and merger of #483)
- Issues and PRs: #117, #483
- Cited in code as: #117
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The cloud column is the one presentation knob that can spend"

## Context

Cloud base and cloud cover need a second Open-Meteo request per location: twelve variables, weight 1.2 on the weather budget.

## Decision

The browser fetches the cloud column only when the ranking or a bound names a cloud family at Analyze time (`namesOnRequestMetric`); `HOURLY_VARIABLES` does not carry it. The snapshot records `cloudFetched`. Picking a cloud ranking or bound over a report without the column raises `cloud-needed`, last in the `commitNeeded` order, because any other cue's Analyze fetches the column too. A report carries the column for every row or for none, and its six table columns are hidden unless the column is held or ranked. The forecast grid fetches it only when the snapshot says so. On the server path a cloud `sort_by` or bound fetches it for every candidate, and `include_clouds` alone fetches it for the returned rows.

## Evidence

Weight 1.2 for twelve variables, at 971fede. No dated measurement.

## Alternatives rejected

- Fetching it on every analysis: 1.2 more weighted calls per location, for a column most reports never show.
- Carrying it in `HOURLY_VARIABLES`: the same cost, on every request.

## Consequences

This is the one presentation knob that can spend (see [0003](0003-analyze-is-spend-boundary.md)). `withCloud` strips the column from held rows a new report did not ask for. The alignment and the eager test are mirror rows 28 and 29.
