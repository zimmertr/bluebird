# 0020. A destination within 10 miles of an active fire is flagged, and an unchecked one is never shown as clear

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 89

- `src/utils/fireProximity.ts` — pure point-to-perimeter distance math flagging results within 10 mi of an active fire (`FIRE_WARN_MILES`; 25 was tried in the #275 review and rejected as too wide)

## From `frontend/src/CLAUDE.md`, line 89

The lookup asks for the **coarse** copy: ~56 m of simplification is 0.035 mi against the 10-mile threshold shown at 0.1 mi, and a thirteenth of the bytes.

## From `frontend/src/CLAUDE.md`, line 89

It returns a **status** (`idle`/`loading`/`ready`/`unavailable`) and an **`uncovered` key set** beside the warnings, retries a failed lookup, and logs the caught error: every failure mode used to collapse into one empty map, so the feature's failure was indistinguishable from its all-clear. The status type itself, `FireProximityStatus`, lives in `fireProximity.ts` rather than in the hook (it moved from `hooks/useFireProximity.ts`), beside `FireWarning`, so a pure module such as `resultsCells.ts` can name it without importing a hook. `ready` + empty means checked and nothing near; `unavailable` means the caller must not imply either; `uncovered` (#256) is the geographic case of the same rule, per row — WFIGS is US-only, the server publishes its coverage outline as a foreign member on `/api/wildfires` (coarse, outward-biased, Alaska split at the antimeridian; `wfigs_coverage.py`), and a destination outside it was never checked, so its cell in the **Wildfire (mi)** column — the table's and the CSV's alike (`WILDFIRE_COL` in `tableColumns.ts`; its key is virtual, so it sorts and renders out of the warning map rather than the row) — reads `N/A`, distinct from the mark a cleared check leaves (a dash on screen, a blank cell in the file), so a missing warning is never mistaken for a clear one.
