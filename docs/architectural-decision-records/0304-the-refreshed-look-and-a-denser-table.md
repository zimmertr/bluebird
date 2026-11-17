# 0304. The app wears one bundled face, sentence-case headings and softer corners, and the results table shows more columns at a time

- Status: Accepted. Amends [0142](0142-sticky-name-column.md) (a phone's Name column is capped at 34% of the sheet, not 45%, and a long name wraps to a second line) and [0257](0257-one-table-look-and-button-shape-by-place.md) (the results table prints heights without a thousands separator and precipitation without trailing zeros; the popup, the chart's card and the CSV keep their prints)
- Date: 2026-11-16
- Decider: the maintainer (TJ), who picked the Refreshed look in #825's second lab on 2026-11-16 and asked for a table that shows more columns at a time, "especially on mobile", because Bluebird Forecast is a spreadsheet app; and who chose, the same day, a looks-only PR with today's controls and words, ahead of the two layout PRs, with the table levers two-line headers, a narrower Name on a phone, tighter rows and compact numbers
- Issues and PRs: #825
- Cited in code as: #825; record 0304
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsTableRow.tsx` and `ResultsTableHeader.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `tableColumns.ts` and `numbers.ts`; [`docs/STYLES.md`](../STYLES.md), Roles and Shapes and tables

## Context

#825's first lab put eighteen layouts beside today's, and the maintainer's note on today's was that it is too dense, reads like the 1990s, and needs polish. The second lab added a Look knob, today's against a Refreshed one, and the maintainer liked the Refreshed look on both layouts still in the running, with one condition: the results table has to show more columns at a time, above all on a phone.

Today's table spent its width on its headers. A metric's whole label stood on one line, so `Freezing level · Min (ft)` set its column's width at twice its five digits, and a phone's stuck Name column could take 45% of the sheet. At 360px that left room for about two metric columns.

## Decision

- **One bundled face, Inter.** `@fontsource-variable/inter` ships the variable font with the app, imported once at the top of `index.css`, and `--font-sans` names it ahead of the system stack. It is bundled rather than fetched because the page's CSP is `default-src 'self'`, and because one face measures the same on every reader's machine, which is what the measured widths in `styles.test.ts` assume. The browser fetches only the subset a page uses: the Latin file is 48,256 bytes.
- **Tabular figures, not a monospace face, for numbers** (`FIGURES`): the table's metric cells, the player's readout and marks, the analysis overlay's count and the chart card's values. Every digit is one width, so a column of figures still aligns. The coordinate box stays monospace, because what it holds is pasted text a reader edits character by character.
- **Sentence-case headings.** `TEXT.section`, `TEXT.overline` and `BADGE_ACCENT` lose `uppercase` and their letter-spacing. Only the transform goes: the words in the source never changed. The section heading moves from slate-300 bold to the strong ink at semibold, so the ink carries the rank the capitals did: white on the dark panel at 14.62:1.
- **Softer corners.** `RADIUS.control` is 6px (`rounded-md`), where it was 4px, and `RADIUS.surface` is 12px (`rounded-xl`), where it was 8px. Every sheet's top corners and the map's credit corner follow the surface, and the popup's close button follows the control.
- **A denser table.**
  - A metric's header is two lines, its name over its unit at the micro step (`TABLE.headUnit`), bottom aligned. The unit comes from the column's declared `unit`, never parsed back out of its label, and the full label stays the header's accessible name.
  - On a phone the Name column is capped at 34% of the sheet (`TABLE.nameCap`): 122px at 360 and 133 at 390, where it was 162 and 175. A long name wraps to a second line rather than truncating (`TABLE.nameText`). A desk keeps one line.
  - The cells keep their padding, so a row is today's height unless its name wraps. The lab's taller row was declined, because a spreadsheet wants rows on screen.
  - The table prints heights without a thousands separator (`14406`, not `14,406`) and precipitation and snowfall without trailing zeros (`0.4`, not `0.40`), through a new `cell` print on `ColDef` that only the table reads. The popup, the chart's card and the CSV keep `format` and `csv`, where a figure stands alone and the separator reads better.
- **No control, string or width changes.** This PR restyles today's controls and words. The phone controls stay 32px (record [0223](0223-finger-controls-draw-32.md)): the maintainer was unsure about the lab's 34px, so the record holds.

## Evidence

Widths at 12px in Inter, measured in Chrome on macOS on 2026-11-16, against the system face they replaced:

| Word | System face | Inter | Its budget |
|---|---|---|---|
| `Radar` | 33.02 | 33.01 | an axis half's floor |
| `UK Met Office` | 79.69 | 79.85 | 84px of the model picker |
| `Precipitation (in/hr)` | 109.03 | 108.90 | the chart select, with 8px to spare |
| `Freezing level` | 78.03 | 78.30 | the metric row's label |
| `Total` | 27.54 | 27.63 | the aggregate dropdown |
| `Highest` | 43.69 | 43.54 | a segment half |
| `Remove` | 44.95 | 45.52 | 46px inside the card button's `w-16` |
| `Draw polygon` | 77.4 | 78.77 | a third of the polygon row |

Every word still fits the room the tests give it, so no control width moved. The one width that did is the map's scale bar: the browser suite tries every label at its narrowest bar, and `1000 km` at 11px ran 2.6px past a 55px bar, so `SCALE_MAX_WIDTH_PX` goes from 110 to 120 and the narrowest bar is 60. Chromium on Linux, which the browser suite runs, rounds each glyph's advance to a whole pixel, so it measures a pixel or two wider (`Remove` 47, `Freezing level` 80); the tests hold the Mac numbers, as they did before.

The composite widths measured in the browser suite's Chromium on 2026-10-29 (the fire key's line, the grid's wait line, the Layers menu, the slider values) were not re-measured in Inter. Each sits well inside its box: the legend card leaves 204px for a line measured at 169.4.

The Lighthouse budget's total is 700,000 bytes against 604,280 measured before this change, so the 48,256-byte Latin file fits under it.

The browser suite also found a drag bug the narrower card exposed. A card opened 1.5px beside the map's rows, and the drag's clearance check reaches 8px out, while the check for what the card already stands over did not; so the first drag pulled the card 8px clear of the rows and shrank it, even when it was dragged to grow. A drag now never takes a card under the size it had as the drag started, where the reader asked for at least that much. The hold is the whole card at once, its opening width and height, which stand over nothing, so the card keeps its place beside the surface: it neither shrinks to clear it by 8px nor grows into it. And a card now opens with the same 8px clear of every surface over the map: the opening fit scores each place against the surfaces grown by the fit's breath, so a card that would stand 1.5px off the rows steps the other 6.5px, the shortest move winning. The maintainer asked for this in the same PR on 2026-11-16, accepting that the map pans a few pixels more often as a card opens.

## Alternatives rejected

- The system face with tabular figures: it measures differently on every platform, so the measured widths would be true on one machine only, and it keeps the look the maintainer called dated.
- Ranked cells as pills: the tinted cell reads as a heat map down a column, which a pill breaks up.
- The lab's 34px phone controls and its Metrics grid behind Add a limit: the first is record 0223's call and stays, and the second is a control change for the layout PRs, not a look.
- Parsing a header's unit out of its label: `tableColumns.ts` already warns against reading a label back, and a label's wording is free to change.
