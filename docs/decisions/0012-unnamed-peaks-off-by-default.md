# 0012. Unnamed peaks are off by default

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 122

`include_unnamed_peaks` adds `_UNNAMED_PEAK_CLAUSES` (peaks with an `ele` but no `name`, returned as `Peak 5961` — the same string `basemapPoi.ts` builds for a clicked one, so both routes produce one destination); it is off by default because it roughly triples the candidate count, it joins the cache key rather than filtering the result, and generated names dedup by OSM id rather than by name, or every unnamed summit at one elevation would collapse into a single row.
