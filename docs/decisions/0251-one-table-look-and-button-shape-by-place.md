# 0251. The three tables share one look, and a button's shape says where it stands

- Status: Accepted
- Date: 2026-10-30
- Decider: the maintainer (TJ), on reviewing PR #828 on 2026-10-30: the shared heads, rows, digits and ranked colour as proposed, the raised square for a close button over a ghost square and a framed circle, the shape rule by where a button stands over one by what it carries and squares everywhere, and the column moves shared with the table
- Issues and PRs: #499, #828
- Cited in code as: TJ 2026-10-30
- Guide: `STYLES.md`; `components/` guide: `TimeSeriesChart.tsx`; `utils/` guide: `popupChrome.ts`; `map/` guide: `resultsLayer.ts`

## Context

The results table, the marker popup and the chart's card each drew a table of numbers their own way. The table had rules between rows and a tint under the pointer; the popup boxed every column in a shaded band and centred bold heads over it; the card printed heights without thousands separators (`≥30000`, `2690`) and only coloured nothing. Buttons were as mixed: the theme switch and the panel's close were circles inside the panel, the chart's + a square, and a card's ✕ a bare glyph with no button around it.

## Decision

- **One table look.** All three take the table's heads (`TEXT.subheading`, right over the digits they name), its rows (a hairline between each, the raised step at 30% under the pointer), its digit grouping, and its ranked colour (`cellStyle`'s tint and ink). The popup's column bands are gone. What stays apart is each one's own strength: the table's sticky head, the popup's metrics down the side, and the card's line swatches.
- **Columns move and size the same way everywhere.** A pinned chart card's heads size by their right edges and a metric's head carries its panel to a new place, the card's columns being the panels. A marker popup's aggregate heads size by their edges, every result card alike for the session, and a head carried onto another moves the table's columns of that aggregate, every family's, which the popup's columns follow, being laid out in the table's order. The window total stays last.
- **A button's shape says where it stands.** A circle floats on the map with nothing behind it (`MAP_ROUND_BUTTON`, the Legend and Layers chips). Every control inside a surface, the panel, a sheet, a card or a popup, is a rounded rectangle, and an icon-only one a raised square with a frame (`SQUARE_BUTTON`): the panel header's buttons, the pinned card's ✕ and the marker popup's ✕.

## Evidence

TJ's screenshots of the three tables side by side, 2026-10-30, and the close-button mockup page (three options in both themes) the same day.
