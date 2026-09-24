# 0061. A pasted coordinate takes the elevation of the peak within 150 m

Verbatim guide text at 971fede, copied before the edit to the template.

## From `backend/CLAUDE.md`, line 35

`enrich.py` is `enrich_custom`, the other direction: one batched `around` query resolves caller-supplied coordinates to the nearest peak within `CUSTOM_MATCH_RADIUS_M` (150 m, measured — see the comment before changing it), filling elevation and `osm_id` only where the caller supplied none. Best-effort by construction: every failure path returns the rows unchanged, so an analysis never fails over an elevation.
