# 0003. Analyze is a spend boundary: data knobs wait for it and presentation knobs apply live

- Status: Accepted
- Date: 2026-07-29 (git: the merge of #189)
- Decider: TJ (git: author and merger of #189)
- Issues and PRs: #166, #188, #189, #213, #230, #231, #449
- Cited in code as: #166, #188, #230
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, "The interaction model: the Analyze button is a spend boundary, not ceremony" and its bullets on data knobs, presentation knobs, the data snapshot, and re-analysis

## Context

A change to the polygon, the destination types, the forecast window or the forecast model is a new fan-out against donated free APIs. A calendar drag that fetched as it moved would send the exploring user into their own rate limit. Sort, limit and the forecast bounds need no new data: they only re-read what the browser holds.

## Decision

Knobs split by whether a change needs new upstream data.

- Data knobs (polygon, destination types, forecast window, forecast model) wait for an Analyze click. `commitNeeded` reports every reason the report is stale, one bullet each, with `model-changed` first, because a model change can clamp the window and the clamp must stay attributed to its cause. The discovery reasons are `polygon-changed`, `types-changed` and `destination-added`, and every cue is a warning.
- Presentation knobs (sort, limit and the forecast bounds) apply live, with no fetch, over the full ranked field the browser holds before the limit cut (`universe`). `utils/present.ts` is the one derivation every surface reads: bounds, then removals, then rank, then cut. Each compares the window's worst hour for a ceiling and its best for a floor, so a bound holds for every hour rather than for an average that hides a bad afternoon; precipitation and AQI have no minimum aggregate, so both of their bounds read `precip_total_in` and `aqi_max`, the freezing level is the one family where neither end is the bad one, so its floor reads `freeze_min_ft` and its ceiling `freeze_max_ft`, and snow depth reads `snow_depth_in` at both ends for a third reason: it is today's one number rather than a reduction over hours, so there is no best or worst hour to choose between (#449). Nulls pass.
- The `analyzed` snapshot pins what was fetched. Live knobs re-present it and never change it.
- A re-analysis fetches only the destinations it has no forecast for, when the resolved window and model are the same and the first fetch is inside `FORECAST_REUSE_MS` (15 minutes). × removals survive it.

## Evidence

No dated measurement. The reason is the spend: each data knob is a real fan-out, and a calendar and a dropdown make a change a single click, so a report can go stale while the panel looks settled (#166, #230).

## Alternatives rejected

- Live data knobs: a calendar drag would reach the user's own rate limit.
- Reporting only the first reason a report is stale.
- A reuse clock that restarts on each re-analysis: a field could be kept alive by re-analyzing every fourteen minutes.
- Comparing the discovery inputs inline in `App.tsx`: logic there is untestable, and a suppression of the types cue shipped uncaught that way.

## Consequences

The discovery identity rides on the snapshot as `polygonKey` and `typesKey` (`discoveryKeys`), and `discoveryChanges` in `present.ts` compares them. `FORECAST_REUSE_MS` mirrors `cache.FORECAST_TTL_S` by a comment (mirror row 21). On the server path the bounds ride on the request and the response reports `total_matched` beside `total_queried`. The cloud column is the one presentation knob that can spend: see [0057](0057-cloud-fetched-on-request.md).
