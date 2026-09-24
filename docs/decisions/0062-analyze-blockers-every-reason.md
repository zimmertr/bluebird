# 0062. Analyze names every reason it is blocked, not the first

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 125

- `src/utils/analyzeGate.ts` — whether Analyze is enabled, and every reason it is not. The three ways to give it something to do are additive (a drawn polygon with a type checked, a pasted list, a pinned search) and the shared guards veto all of them. `analyzeBlockers` returns EVERY blocker rather than the first: the guards are independent, so a reader with both an oversized polygon and an unservable window used to fix the polygon and be met by a second sentence that had been true the whole time. Its postcondition is that it is non-empty exactly when `canAnalyze` is false, over every combination of the flags including ones the panel cannot produce, so the button can never go dead without saying why. The one exception is mid-analysis, where it returns nothing because the button already says it is busy.
