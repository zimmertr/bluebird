# 0263. Load a list beside Coordinate search is the one menu over the example lists, which load into the box

- Status: Accepted. Amends [0156](0156-destination-subheadings-say-search.md) and [0260](0260-messages-draw-the-eye-and-failures-open-the-list.md)
- Date: 2026-11-03
- Decider: the maintainer (TJ), on issue #838, 2026-10-30 to 2026-11-03
- Issues and PRs: #838, #839, #710
- Cited in code as: #838
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` and `Menu.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `exampleLists.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Coordinate search

## Context

The Coordinate search box shows the format and one Mount Rainier row as its placeholder. The repository carried four whole lists in that format under `csv-examples/` at its root, and the app offered none of them: `.dockerignore` left the folder out of the image, and the only pointer was a sentence in `USAGE.md`. A reader in the panel had one row to go on. The maintainer expects dozens of lists in time.

## Decision

- **`Load a list` stands in the control column beside the `Coordinate search` subheading**, a `MenuSelect` at `CONTROL_W` like every other row's control, and opens the one menu over the lists (record 0201); on a phone, its sheet. The subheading stays `Coordinate search`, so record 0156's three headings still read as a set.
- **The lists are named as hikers know them**: `The Bulger List`, `Mountaineers 100 Peaks at Mount Rainier`, `Smoot's 100 Peaks` and `Alpine Lakes Home Court Top 100`.
- **A pick loads the list into the box rather than linking to it.** In an empty box the list stands alone; in a box with rows it goes under them, so a pick never costs a reader what they typed, and a row in both is analyzed once, as a line pasted twice already is. The map frames the result as it frames a paste, and the keyboard goes to the box.
- **The field keeps no choice.** After a pick it reads `Load a list` again, through a `placeholder` on `MenuSelect` for a value that names no option, so the same list can be picked twice and the field never claims the box holds one list.
- **The lists moved to `frontend/src/csv-examples/`** and ship in the image, each a hashed asset fetched on the pick that asks for it.
- **A list that does not arrive is an error line in the Analyze button's list**, `The list could not load. Try again later.`, keyed `list:failed` and gone when the next pick lands. It joins `LIST_OPENING_KEYS` beside the check and basemap failures (record 0260): the reader asked for rows and the box stayed as it was, and without the list opening they might never learn why.

## Evidence

The four lists are 15.8 KB together, 7.1 KB gzipped (measured 2026-10-30). Each is just under Vite's 4 kB inline limit, so each import carries `?url&no-inline`, or all four would ride the cold load's script as data URLs. They are fetched through `apiFetch` rather than a lazy `import()` for the reason `usStatesLoad.ts` gives: a stale tab's failed import fires `vite:preloadError` and `staleChunk.ts` reloads the page, which would cost the reader a drawn ring. Only an offline reader or a tab left open across a release meets the failure.

Mockups of the eleven placements tried first: https://claude.ai/artifact/ESvNXx2bL68p2VnW7d6dQ8.

## Alternatives rejected

- **`Examples` linking to `csv-examples/` on GitHub**, right-aligned on the subheading's line: the PR's first version, approved 2026-10-30. The maintainer preferred the lists loading in the app on 2026-10-31; a link sends a hiker to a code site to copy a file by hand.
- **A question mark beside the subheading opening a note with the lists as bullets** (option I2 on the mockups): built on 2026-10-31 and sent back on 2026-11-03, because four bullets will not hold dozens of lists. It also needed two lint exceptions, to `style-menu-trigger` and `style-panel-messages`, which the menu does not.
- **Building the lists into the page's script**: never fails to load, but every visitor carries every list against the cold load's script budget, and dozens of lists would be 100 KB or more.
- **Renaming the subheading to `CSV search` or `Coordinate CSV search`**: "CSV" is jargon to a hiker, the box also takes lines typed by hand, and the rename breaks 0156's three-heading set.
- **Replacing the box on a pick**, or **offering the lists only while it is empty**: the first throws away what a reader typed and the second hides the lists once they are useful for combining.
- **Saying nothing on a failed load**, the way the state outlines fail: the maintainer asked for the line (2026-11-03), since a reader who picked a list and saw nothing has no other way to learn why.

## Consequences

A new list from the `peakbagger-list-csv` skill lands in `frontend/src/csv-examples/` and joins `EXAMPLE_LISTS`, and its name is a string the maintainer approves. `NOTICES.md` credits Peakbagger.com under Bundled data, since the image now carries the lists. When the lists grow past a screen, the menu takes the model list's group heads and a filter box; neither is built until they arrive.
