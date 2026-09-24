# 0037. A change to Rank by discards the reader's column order

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 37

`applyColumnOrder`/`moveColumn`/`stepColumn` lay the reader's own order over that derivation: it is stored under `bluebird_forecast_view.columnOrder`, it is deliberately NOT in the URL (a shared link opens in the standard order), the CSV follows the screen, and **a change to `Rank by` discards it** — ranking lifts its own metric group to the front and TJ chose to let ranking win (2026-09-14). The discard is guarded by a `rankedOnce` ref in `App.tsx`, because the effect that watches `sortBy` also fires on mount and was wiping a stored order on every page load.
