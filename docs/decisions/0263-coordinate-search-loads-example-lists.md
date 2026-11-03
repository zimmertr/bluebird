# 0263. An Example list row under Coordinate search names the list the box holds, and a pick replaces the box, asking first over typed rows

- Status: Accepted. Amends [0156](0156-destination-subheadings-say-search.md) and [0260](0260-messages-draw-the-eye-and-failures-open-the-list.md)
- Date: 2026-11-03
- Decider: the maintainer (TJ), on issue #838, 2026-10-30 to 2026-11-03
- Issues and PRs: #838, #839, #710
- Cited in code as: #838
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx`, `ConfirmDialog.tsx` and `Menu.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `exampleLists.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Coordinate search

## Context

The Coordinate search box shows the format and one Mount Rainier row as its placeholder. The repository carried four whole lists in that format under `csv-examples/` at its root, and the app offered none of them: `.dockerignore` left the folder out of the image, and the only pointer was a sentence in `USAGE.md`. A reader in the panel had one row to go on. The maintainer expects dozens of lists in time.

## Decision

- **An `Example list` row stands under the `Coordinate search` subheading and above the box**: a label on the left and a `MenuSelect` at `CONTROL_W` in the control column, the shape of every other row in the panel. The subheading stays `Coordinate search` with nothing on its line, so record 0156's three headings still read as a set.
- **The field says what the box holds**, the way `Model` says which model: the list's name while the box is exactly a list that arrived this session, `None` over an empty box and `Custom` over rows of the reader's own. A select that showed an instruction and kept no value read as a button dressed as a field.
- **The lists are named as hikers know them**: `The Bulger List`, `Mountaineers 100 Peaks at Mount Rainier`, `Smoot's 100 Peaks` and `Alpine Lakes Home Court Top 100`.
- **A pick replaces the box.** An empty box, or one holding a list, is replaced at once; rows the reader typed are asked about first, in a dialog headed `Load {name}?` whose one sentence is `This replaces the rows in the Coordinate search box.`, with `Load` and `Cancel`. A list is nothing of the reader's and their rows are. The map frames the result as it frames a paste, and the keyboard goes to the box.
- **The dialog is the welcome dialog's**: the same card, scrim and stacked foot (`ConfirmDialog`), so the app has one dialog look at every width. Escape and the scrim are Cancel.
- **The lists moved to `frontend/src/csv-examples/`** and ship in the image, each a hashed asset fetched on the pick that asks for it and held for the session.
- **A list that does not arrive is an error line in the Analyze button's list**, `The list could not load. Try again later.`, keyed `list:failed` and gone when the next pick lands. It joins `LIST_OPENING_KEYS` beside the check and basemap failures (record 0260): the reader asked for rows and the box stayed as it was, and without the list opening they might never learn why.

## Evidence

The four lists are 15.8 KB together, 7.1 KB gzipped (measured 2026-10-30). Each is just under Vite's 4 kB inline limit, so each import carries `?url&no-inline`, or all four would ride the cold load's script as data URLs. They are fetched through `apiFetch` rather than a lazy `import()` for the reason `usStatesLoad.ts` gives: a stale tab's failed import fires `vite:preloadError` and `staleChunk.ts` reloads the page, which would cost the reader a drawn ring. Only an offline reader or a tab left open across a release meets the failure.

A share link restores the box's rows and not what arrived, so a reloaded page reads a restored list as `Custom` until a list is picked again, and the first pick after a reload asks once. Accepted rather than fetched around: comparing the box against four lists on every load would spend four fetches to save one question.

Mockups of the eleven placements tried first: https://claude.ai/artifact/ESvNXx2bL68p2VnW7d6dQ8.

## Alternatives rejected

- **`Examples` linking to `csv-examples/` on GitHub**, right-aligned on the subheading's line: the PR's first version, approved 2026-10-30. The maintainer preferred the lists loading in the app on 2026-10-31; a link sends a hiker to a code site to copy a file by hand.
- **A question mark beside the subheading opening a note with the lists as bullets** (option I2 on the mockups): built on 2026-10-31 and sent back on 2026-11-03, because four bullets will not hold dozens of lists. It also needed two lint exceptions, to `style-menu-trigger` and `style-panel-messages`, which the menu does not.
- **A `Load a list` select on the subheading's line**: built on 2026-11-03 and sent back the same day as out of place. It showed an instruction where every neighbour shows a value, and stood beside one of three parallel headings, none of which carries a control.
- **The row below the box**: offered beside the row above it; the maintainer put it above (2026-11-03).
- **Adding a picked list under the rows already there**: the first replace rule, reversed by the maintainer on 2026-11-03 for replacing, with a question first over typed rows.
- **Replacing at once, or offering Undo instead of a question**: a reader who pasted a long list would lose it to one wrong pick, and Undo has nowhere to live, since no message box carries a button (record 0169) and a controlled textarea breaks the browser's own undo.
- **Building the lists into the page's script**: never fails to load, but every visitor carries every list against the cold load's script budget, and dozens of lists would be 100 KB or more.
- **Renaming the subheading to `CSV search` or `Coordinate CSV search`**: "CSV" is jargon to a hiker, the box also takes lines typed by hand, and the rename breaks 0156's three-heading set.
- **Saying nothing on a failed load**, the way the state outlines fail: the maintainer asked for the line (2026-11-03), since a reader who picked a list and saw nothing has no other way to learn why.

## Consequences

A new list from the `peakbagger-list-csv` skill lands in `frontend/src/csv-examples/` and joins `EXAMPLE_LISTS`, and its name is a string the maintainer approves. `NOTICES.md` credits Peakbagger.com under Bundled data, since the image now carries the lists. When the lists grow past a screen, the menu takes the model list's group heads and a filter box; neither is built until they arrive. `ConfirmDialog` is the app's one question before discarding work, and a second caller reuses it rather than drawing its own.
