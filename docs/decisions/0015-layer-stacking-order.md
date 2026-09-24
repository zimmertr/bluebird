# 0015. Stacking order is one named table, LAYER

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 63

- `src/styles.ts` — the type ramp plus the surface/button/field roles, and `LAYER`, which names the stacking order; components compose these instead of picking sizes, colors and z-indexes at the call site (`src/styles.test.ts` enforces it). `LAYER` exists because the model picker shipped *behind* the mobile drawer that contains it, the two values having been chosen in different files and never compared
