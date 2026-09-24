# 0049. A legend strip prints three ticks and no unit

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 86

`scaleTicks` prints THREE of a metric scale's five boundaries, which is measured rather than chosen: five land 27px apart on a 162px strip and the freezing level's are 28 to 33px wide, so they overlapped into one run of digits (Chrome, 2026-09-17). The numbers are the thresholds themselves formatted, never captions written beside them, so a tick cannot disagree with the colour it names, and they carry NO unit: the section's label does (`metricLabel` in `metrics.ts`, reading the SCALE's unit, so playback's swap to `in/hr` relabels the strip with its bands), which is what keeps `AQI` a bare noun and the strip's widest label three characters shorter (TJ, 2026-09-17). The snow layer follows the same rule, reading `Snow depth (in) (NOHRSC)` — its unit in its own parentheses and the credit in a second pair (TJ, 2026-09-17), so no strip on the map carries a unit among its numbers
