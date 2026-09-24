# 0035. The sheet lift is measured, not derived

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 74

**That lift is MEASURED, not derived** (`resolveSheetLift`, fed by a `ResizeObserver` on the sheet in `hooks/useResultsLayout.ts`): adding up a header, its grips and the panel heights is an estimate, and the estimate was 20px long on the header and 16px short on each grip, so the four results states sat 44.5, 44.5, 28.5 and 60.5px clear of the player instead of one number (#249 review). The derived `sheetHeightPx` survives for the two jobs an estimate is right for — the resting reserve the clamp takes and the camera padding — both of which must answer the same before and after a drag.
