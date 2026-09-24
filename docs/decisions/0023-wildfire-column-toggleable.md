# 0023. The wildfire column is on by default and can be hidden

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 89

The screen column is shown by default and toggleable in the Columns picker like every other column (TJ 2026-08-21, reversing the earlier always-on rule; visibility persists under `bluebird_forecast_view.columns3` — one key per generation of the column set, because a stored set is otherwise indistinguishable from a deliberate choice to hide the newest column, so `columns` migrates as wildfire- and freeze-visible and `columns2` as freeze-visible, each predating its choice); while shown, its cells tick `fireLoadingFrame`'s muted middle dots while the check runs, and the warned cell is the row's ONLY flag (the name column carries none) — where `resultsCsv.ts` appends it only under `fire.status === 'ready'` AND while the column is shown, because a file cannot resolve a mid-flight column and must not carry a column the screen does not show.
