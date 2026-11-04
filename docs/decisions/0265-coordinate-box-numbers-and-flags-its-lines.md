# 0265. The coordinates box numbers its lines and flags the ones it cannot read

- Status: Accepted. Amends [0263](0263-coordinate-search-loads-preset-lists.md) (the box it opens) and [0208](0208-analyze-button-counts-the-messages.md) (a second `STATUS` colour outside the list)
- Date: 2026-11-03
- Decider: the maintainer (TJ), on issue #838, 2026-11-03
- Issues and PRs: #838, #839
- Cited in code as: record 0265
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, the messages bullet; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `CoordinateBox.tsx` and `DestinationsSection.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `customDestinations.ts` bullet; [`docs/STYLES.md`](../STYLES.md), Every message is a box; [`docs/USAGE.md`](../USAGE.md), Coordinate search

## Context

The parse drops a line it cannot read, a name with no coordinates or a pair off the globe, and says nothing. The caption under the box counts the rows it kept, so a list of a hundred with one bad line read `99 destinations parsed`, and the reader had to find the missing peak by counting.

## Decision

- **The box numbers its lines in a gutter beside the textarea** (`CoordinateBox.tsx`): one number per line of the box, `1` for a blank box, right-aligned on the textarea's 12px mono type and 16px line, behind a rule in the rule colour. The gutter scrolls with the textarea, and the grid row is the textarea's height, so the resize corner moves both.
- **Wrapping is off.** One line of the box is one line on screen and one number, so a number never stands beside half a row.
- **A line the parse drops is flagged**: its number in the error ink with a 4px dot before it. A line is flagged exactly when `parseCustomCsv` drops it, because both read one function (`readLine` in `customDestinations.ts`). Blank lines and `#` comments are skipped on purpose and carry no flag.
- **The caption says it in words**: `{n} destinations parsed, {k} lines not read`, with `line` for one and no tail while every line reads. The gutter is hidden from a screen reader, so the caption is its counterpart.
- **The flag is the box's own readout, beside the box**, as the draw counter is the polygon's, rather than a message about the analysis, so it does not join the list the Analyze button opens. Its ink rides the role (`COORD_BOX.flagged`), and the linter's `style-coord-gutter` check pins it to one use in `CoordinateBox.tsx`, with no bare `STATUS`, notice box or live region there.

## Evidence

The gutter is a column of spans, not an editor. CodeMirror or Monaco would number lines too, but either would spend much of the headroom left under the cold load's script budget (620,000 B in `.github/lighthouserc.js` against 563,835 B measured when the gate landed) on a box most readers fill from the menu.

The gutter's numbers take the caption's ink, the placeholder's step: 6.78:1 on the dark field and 9.36:1 on the light. The faint ink reads 3.74:1 on the dark field, under AA. The flag reads 6.17:1 dark and 9.35:1 light (measured 2026-11-03, pinned in `styles.test.ts`).

## Alternatives rejected

- **Numbers alone, with no flag**: a code editor's affordance with no job here. A reader does not need to know a row is the forty-third; they need to know which row did not read.
- **An editor library** (CodeMirror, Monaco): numbers and marks for free, at the script cost above.
- **A table of the parsed rows under the box**: the pending rows in the results table already are that table, named and placed on the map.
- **A message in the Analyze button's list**: the count belongs beside the box it counts, and a message there would point back at a line it cannot show.

## Consequences

A long name runs past the box's edge and scrolls sideways rather than wrapping. A box that ends in a newline shows one more number than it has rows, since the textarea shows that empty line too.
