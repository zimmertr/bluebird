# 0224. Removed stands greyed while nothing is removed

- Status: Accepted. Amends [0209](0209-shift-range-and-standing-reset.md): Removed greys at zero rather than until the results area has rows, and its menu closes when its last row is restored.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on PR #796, reading record 0219's "Download CSV stands greyed with nothing to download": "`Removed` menu should too, right?", then choosing to grey it at zero
- Issues and PRs: #796
- Cited in code as: record 0224
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsSheet.tsx`/`ResultsBar.tsx` and `RemovedPicker.tsx` bullets; [`docs/USAGE.md`](../USAGE.md), Viewing the results and Results Table

## Context

Record 0209 kept Removed in the bar and greyed it only until the results area had a row. With rows and nothing removed it was live, and it opened onto an empty list with Restore all greyed: a menu with nothing in it, under a button whose count already said zero. Record 0219 then greyed Download CSV whenever there was nothing to download, so the two buttons beside each other greyed on different questions.

## Decision

Removed is greyed while nothing is removed, and cannot open. The sheet closes the menu whenever the list empties, whatever emptied it. Restoring the last row takes its Restore button, the menu and the live Removed button out from under the keyboard at once, so the row brought back takes the focus: its name's button in the table, found by the `data-key` every row carries (the removal's `geoKey`). After Restore all it is the first restored row in the table's order. Where the table does not show the row (under the limit's cut, outside a bound, in Chart, or under a folded phone sheet), Columns takes it.

## Evidence

None measured; the rule is 0219's, applied back to Removed.

## Alternatives rejected

- **Removed live at zero once there are rows**, as 0209 had it: a menu that opens on an empty list.
- **The menu staying open after the last restore**, as it did: with Removed greyed, nothing near the list could take the keyboard, and a disabled button cannot hold it, so the next Tab would start from the top of the page (#576).

## Consequences

`ResultsBar.test.tsx` holds Removed greyed at zero. `ResultsSheet.test.tsx` holds the close and the three handoffs: the restored row, the first of several, and Columns. `RemovedPicker` still greys Restore all on an empty list, which the sheet no longer leaves open.
