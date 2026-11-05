# 0032. A model comparison fetches one request per model, bought at Analyze

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #333)
- Decider: TJ (git: author and merger of #333)
- Issues and PRs: #232, #333
- Cited in code as: #232
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/modelCompare.ts` bullet, from "`hooks/useModelCompare.ts` is the spend"

## Context

A comparison needs several models' forecasts for every charted destination.

## Decision

`useModelCompare` buys one single-model `fetchWeather` per model over every charted destination at once. The fetch is bounded by `analyzed.compareModels`, the set ticked when the analysis committed: a tick is a data knob and waits for Analyze, and an untick applies at once. A restored `compare=` link buys its forecasts on the first Analyze, never on load.

## Evidence

Measured 2026-09-12 at 46.5,8.0: `models=gfs_hrrr,ecmwf_ifs025` answers HTTP 200 with `precipitation` and no suffix, which is one model's numbers under no label.

## Alternatives rejected

- One request naming several models: the response collapses to bare keys when any model in it is out of domain, so one model's absence takes its companion's lines with it.

## Consequences

Each model gets its own verdict (a single-model request 400s and names itself), the per-location and model cache, and the vector-pinned aggregation, so a compared line and a re-analysis under that model cannot disagree. `compareAdded` is the predicate behind the `model-changed` cue.
