# 0032. A model comparison fetches one request per model, bought at Analyze

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 58

`hooks/useModelCompare.ts` is the spend, and it buys **one single-model `fetchWeather` per model over every charted destination at once, rather than one request naming several models**: a multi-model response collapses to BARE keys the moment any model named in it is out of domain (measured 2026-09-12 at 46.5,8.0, `models=gfs_hrrr,ecmwf_ifs025` answers HTTP 200 with `precipitation` and no suffix, which is one model's numbers under no label), so one model's absence would take its companion's lines with it. The split buys the per-model verdict — a single-model request 400s and names itself — plus the per-location+model cache and the vector-pinned aggregation itself, so a compared line and a re-analysis under that model cannot disagree.

## From `frontend/src/CLAUDE.md`, line 58

**A tick is a data knob and an untick is not.** The fetch is bounded by `analyzed.compareModels`, the set ticked when the analysis committed, so ticking a box afterwards draws nothing and cues `commitNeeded`'s existing `model-changed` reason (`compareAdded` is the predicate, and the asymmetry is the one every live knob has: unticking re-presents numbers already in hand and applies at once). A restored `compare=` link therefore buys its forecasts on the first Analyze and never on load.
