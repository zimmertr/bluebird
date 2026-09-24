# 0036. Windy links follow a grammar measured against the live site

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 40

- `src/utils/windy.ts` — where a metric cell or a popup row links to on Windy (`windyModel`, `windyTime`, `extremeHourMs`, `windyUrl`). Windy's deep-link grammar is undocumented and was measured against the live site on 2026-09-14; the file's head comment is the record of it, including that the time token is **UTC**, that Windy snaps the hour to the model's own step, and that it ignores an hour in the past. Model tokens were read from Windy's own `W.products` registry and matched by PROVIDER, so a reader who picked the Met Office lands on the Met Office's model; a regional token outside its domain falls back to ECMWF on Windy's side, which is what lets this file carry no coverage polygons. Snow depth is absent from `EXTREME` rather than mapped to a series, because it names no hour at all: the link opens `snowcover` at Windy's own "now" (#449)
