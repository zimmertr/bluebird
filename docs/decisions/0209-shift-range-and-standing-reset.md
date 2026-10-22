# 0209. Shift-click selects a range of boxes, and a menu's reset stands greyed at the default

- Status: Accepted; amended by [0219](0219-download-csv-stands-greyed.md)
- Date: 2026-10-21
- Decider: the maintainer (TJ), on the review of #786, in three asks the same day: Shift-click in the Columns, Models, Layers and results-bar Models menus should select every box between the pressed one and the last pressed, as a file manager does; and Restore all should always be in the Removed menu, greyed with nothing to restore, with the Removed button always in the bar, greyed until the results area has rows, and a Reset all of the same kind in the Columns and results-bar Models menus, greyed at the default; and, on the review of PR #789, a way to clear the panel's model comparison, chosen as `Remove all` at the end of the Comparing chip row, greyed when that row is empty, over `Clear comparison` and over clearing every model
- Issues and PRs: #786, #789
- Cited in code as: record 0209
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ColumnsPicker.tsx`, `ModelsPicker.tsx`, `RemovedPicker.tsx`, `LayersPopover.tsx`, `ModelPicker.tsx` and `ResultsBar.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useShiftRange.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `rangeSelect.ts`; [`docs/USAGE.md`](../USAGE.md), Viewing the results, Comparing models on the chart, Results Table and Map layers

## Context

Four menus in the app are lists of checkboxes: the results bar's Columns and Models, the map's Layers, and the panel's Model list. Each box took one press, so hiding six of nine columns was six presses, where every file manager and mail list lets a press with Shift held reach the whole run from the last press. The Removed menu's Restore all appeared with the second removal and went with the second last, and the Removed button itself came and went with the count, so both had to be found again each time, which is the complaint Clear filters answered in the Metrics table (TJ, 2026-09-14: a control that appears and disappears moves everything under it). Columns and Models had no way back to their defaults at all, and the panel's Model list could drop a compared model only one × at a time.

## Decision

- **Shift-click selects a range.** In each of the four lists a press with Shift held sets every box from the last box pressed in that list to this one, both included, to the state this one is taking (`rangeKeys` in `utils/rangeSelect.ts`; `useShiftRange` holds the anchor while the menu is open and forgets it when the menu closes). A box the range crosses that cannot be pressed keeps its state: a ranked column, a greyed layer, the last selected model. In the panel's Model list the rule is applied row by row through `toggleSelected`, so a range that crosses the ranking model passes the ranking the way one press does. The keyboard's Space is a plain press.
- **Restore all always stands in the Removed menu**, greyed with nothing to restore, and **the Removed button always stands in the results bar** whenever Columns does, greyed until the report has a row to remove or one removed. A report whose every row was removed keeps the button live, or the way back would close behind the last removal. The menu stays open when its last row is restored, with Restore all greyed, and the keyboard goes to the Removed button.
- **Reset all stands in the Columns and results-bar Models menus**, last in each, greyed while the boxes already show the default. Columns' default is every column on and the Model column following the model count (`useTableView.resetColumns`, `columnsAtDefault`, read off the boxes rather than off the stored answers, so a reader who ticked everything back by hand is at the default too); Models' is every model drawn (`useChartCompare.showAllModels`). Neither touches a column's order or width.
- **Remove all stands at the end of the Model list's Comparing row**, greyed while nothing is compared. It presses every compared chip's ×, each of which is named `Remove <model>`, so the word is theirs; the ranking model stays and keeps ranking, since a report has to come from some model. The `Comparing` heading and its row stand with nothing compared so the button can stand greyed there, where until now the group was drawn only while something was compared (TJ, 2026-09-14). The keyboard reaches it as one Tab stop between the chips and the list while it can act, and goes to the ranking chip once it has.

## Evidence

The maintainer's two asks on 2026-10-21, both naming the convention as standard. Clear filters' always-drawn rule, `MetricsTable.tsx`, 2026-09-14.

## Alternatives rejected

- **Shift+arrow range selection from the keyboard**: the lists are checkboxes the Tab key walks, with no selection cursor to extend; the panel's Model listbox has one but toggles on Enter and Space alone. Not asked for.
- **A Reset all that also restores the column order**: the maintainer asked for the boxes. The order has its own rule, which the ranking resets.
- **Clearing every model, the ranking one included, and saying in the messages that Analyze needs one**: a press that greys Analyze to make the reader pick again what they already had. The ranking model stays.
- **`Clear comparison` as the word**: the maintainer found it awkward; each chip's × already says Remove.
- **Closing the Removed menu when its last row is restored** (what it did): the menu opens at zero now, so closing at zero from inside would be the one state it refused to show.

## Consequences

`ColumnsPicker` and `ModelsPicker` take `onReset`, and `ColumnsPicker` `atDefault`; `ResultsBar` draws Removed under `showTable` and greys it; `RemovedPicker` keeps no close-at-zero effect. `layerRow` in `LayersPopover.tsx` hands its press the event. `ModelPicker` draws both chip groups on every open, so with nothing compared the list stands one heading and one row lower than it did. The bar's measured widths in `docs/STYLES.md` were taken with Removed showing and hold.
