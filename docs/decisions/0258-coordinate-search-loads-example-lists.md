# 0258. A question mark beside Coordinate search opens example lists that load into the box

- Status: Accepted. Amends [0156](0156-destination-subheadings-say-search.md) and [0251](0251-metrics-section-ranks-from-a-menu.md)
- Date: 2026-10-31
- Decider: the maintainer (TJ), on issue #838, 2026-10-30 and 2026-10-31
- Issues and PRs: #838, #839, #710
- Cited in code as: #838
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `exampleLists.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Coordinate search

## Context

The Coordinate search box shows the format and one Mount Rainier row as its placeholder. The repository carried four whole lists in that format under `csv-examples/` at its root, and the app offered none of them: `.dockerignore` left the folder out of the image, and the only pointer was a sentence in `USAGE.md`. A reader in the panel had one row to go on.

## Decision

- **A question mark right after the `Coordinate search` subheading** opens a note, and a second press shuts it. It sits beside the words rather than at the row's right edge, where the panel's controls stand, because it is about the heading (option I2 on #838's mockups).
- **The note reads `Paste a CSV of coordinate pairs, or load a list:`** over the four lists by their real names: `The Bulger List`, `Mountaineers 100 Peaks at Mount Rainier`, `Smoot's 100 Peaks` and `Alpine Lakes Home Court Top 100`. The button's accessible name is `About coordinate search`.
- **A press loads the list into the box rather than linking to it.** In an empty box the list stands alone; in a box with rows it goes under them, so a press never costs a reader what they typed, and a row in both is analyzed once, as a line pasted twice already is. The map frames the result as it frames a paste, the note closes, and the keyboard goes to the box.
- **The lists moved to `frontend/src/csv-examples/`** and ship in the image, each a hashed asset fetched on the press that asks for it.
- **The question mark is the second exception to `style-menu-trigger`** (record 0251), after the message badge: it opens a note in the panel's flow, not a menu, so a trigger's chevron would promise choices it does not hold. It wears `ICON_BUTTON`, so its hover is the accent ink every glyph button shares.
- **The four lists keep their bullets**, so `DestinationsSection.tsx` leaves `style-panel-messages`, whose ban on lists keeps the full text column for messages. The note holds none.

## Evidence

The four lists are 15.8 KB together, 7.1 KB gzipped (measured 2026-10-30). Each is just under Vite's 4 kB inline limit, so each import carries `?url&no-inline`, or all four would ride the cold load's script as data URLs. They are fetched through `apiFetch` rather than a lazy `import()` for the reason `usStatesLoad.ts` gives: a stale tab's failed import fires `vite:preloadError` and `staleChunk.ts` reloads the page, which would cost the reader a drawn ring. A failed fetch leaves the box as it was.

Mockups of every option, with the I2 placement: https://claude.ai/artifact/ESvNXx2bL68p2VnW7d6dQ8.

## Alternatives rejected

- **`Examples` linking to `csv-examples/` on GitHub**, right-aligned on the subheading's line: the PR's first version, approved 2026-10-30. The maintainer preferred the lists loading in the app on 2026-10-31; a link sends a hiker to a code site to copy a file by hand.
- **The question mark at the row's right edge** (option I): it read as an action on the box.
- **A footer inside the field** (option E and three quieter versions): tried on the mockups and passed over for I2.
- **Renaming the subheading to `CSV search` or `Coordinate CSV search`**: "CSV" is jargon to a hiker, the box also takes lines typed by hand, and the rename breaks 0156's three-heading set.
- **Replacing the box on a press**, or **offering the lists only while it is empty**: the first throws away what a reader typed and the second hides the lists once they are useful for combining.
- **The four lists without bullets**, to stay inside `style-panel-messages`: the maintainer kept the bullets (2026-10-31).
- **A native `<details>` element** to get past `style-menu-trigger` without an exception: it meets the letter of the check and not its reason.

## Consequences

A new list from the `peakbagger-list-csv` skill lands in `frontend/src/csv-examples/` and joins `EXAMPLE_LISTS`, and its name is a string the maintainer approves. `NOTICES.md` credits Peakbagger.com under Bundled data, since the image now carries the lists.
