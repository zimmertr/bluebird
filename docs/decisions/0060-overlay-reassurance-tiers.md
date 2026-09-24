# 0060. The discovery wait is narrated in tiers set by measured mirror times, with no promised ceiling

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 133

- `src/utils/analyzeOverlay.ts` — the full-screen Analyze overlay, composed from the phase status, the batch counts and the pacer's remaining seconds. The heading carries the TOTAL and never a live fraction, which the bar underneath already draws. Its one detail line is what keeps a paced analysis from reading as a hang — a countdown says the wait is scheduled — and its staged reassurance during discovery is tiered to the measured Overpass mirror behavior rather than to a round number, after the earlier copy promised a ceiling that a large polygon crossed
