# 0263. The Coordinate search row is the Polygon row's grid, and a picked example list replaces the box at once

- Status: Accepted. Amends [0156](0156-destination-subheadings-say-search.md) and [0260](0260-messages-draw-the-eye-and-failures-open-the-list.md)
- Date: 2026-11-03
- Decider: the maintainer (TJ), on issue #838, 2026-10-30 to 2026-11-03
- Issues and PRs: #838, #839, #848, #710
- Cited in code as: #838
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` and `Menu.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `exampleLists.ts` bullet; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `coordinate-lists/` bullet; [`docs/USAGE.md`](../USAGE.md), Coordinate search; the `peakbagger-list-csv` skill

## Context

The Coordinate search box shows the format and one Mount Rainier row as its placeholder. The repository carried four whole lists in that format in a folder at its root, and the app offered none of them: `.dockerignore` left the folder out of the image, and the only pointer was a sentence in `USAGE.md`. A reader in the panel had one row to go on. The maintainer expects dozens of lists in time.

## Decision

- **The row under the `Coordinate search` subheading is the Polygon row's grid** (`DRAW_ROW.row`, three equal cells): the `Example list` field across the first two cells (`DRAW_ROW.field`) and `Clear` in the third, on the edge the Polygon row's `Clear` stands on. The field has no visible label; `Example list` is its name to a screen reader. The subheading stays `Coordinate search` with nothing on its line, so record 0156's three headings still read as a set.
- **The field says what the box holds**, the way `Model` says which model: the list's name while the box is exactly a list that arrived this session, `None` over an empty box and `Custom` over rows of the reader's own. A select that showed an instruction and kept no value read as a button dressed as a field.
- **A pick replaces whatever the box holds at once, typed rows included.** The pick is the press that means it, so nothing asks first. The map frames the result as it frames a paste, and the keyboard goes to the box.
- **`Clear` empties the box** the way deleting every character by hand does, and does nothing more. It greys over a blank box. It is named with the subheading for a screen reader, since the Polygon row's `Clear` is a second button with the same word.
- **The field stands as tall as the button beside it**: 28px at a desk (the button's 16px line and 6px a side; the field's 16px line, 5px a side and a 1px border) and 32px on touch, where `TAP` grows both.
- **The lists live in `frontend/src/coordinate-lists/`, and the directory is the list.** `exampleLists.ts` finds them with `import.meta.glob`, so a file added or removed there is on or off the menu at the next build with no other edit. Each file is named as the menu reads it, `The Bulger List.csv` and so on, and the menu reads them alphabetically, the only order a directory can state. A file carries rows and nothing else: no headline.
- **Each list is fetched on the pick that asks for it** and held for the session, as a hashed asset globbed with `?url&no-inline`.
- **A list that does not arrive is an error line in the Analyze button's list**, `The list could not load. Try again later.`, keyed `list:failed` and gone when the next pick lands. It joins `LIST_OPENING_KEYS` beside the check and basemap failures (record 0260): the reader asked for rows and the box stayed as it was, and without the list opening they might never learn why.

## Evidence

The four lists were 15.8 KB together, 7.1 KB gzipped (measured 2026-10-30, with their headlines). Each is just under Vite's 4 kB inline limit, so each carries `?url&no-inline`, or every list would ride the cold load's script as a data URL. They are fetched through `apiFetch` rather than a lazy `import()` for the reason `usStatesLoad.ts` gives: a stale tab's failed import fires `vite:preloadError` and `staleChunk.ts` reloads the page, which would cost the reader a drawn ring. Only an offline reader or a tab left open across a release meets the failure.

A third of the row leaves 72px of label beside the chevron at 12px, and `The Bulger List` is 85px, so every name truncates in one cell (measured on the lab page, 2026-11-03). Two cells hold every name the four lists carry.

`exampleLists.test.ts` reads the directory and holds every file there to rows only, each of which parses, so a fifth list is checked without an edit. `styles.test.ts` holds the field and the button to 28px.

Mockups of the eleven placements tried first: https://claude.ai/artifact/ESvNXx2bL68p2VnW7d6dQ8.

## Alternatives rejected

- **`Examples` linking to the lists' folder on GitHub**, right-aligned on the subheading's line (the issue's option A): the PR's first version, approved 2026-10-30. The maintainer preferred the lists loading in the app on 2026-10-31; a link sends a hiker to a code site to copy a file by hand.
- **A question mark beside the subheading opening a note with the lists as bullets** (option I2 on the mockups): built on 2026-10-31 and sent back on 2026-11-03 as short-sighted, because bullets will not hold dozens of lists. It also needed two lint exceptions, to `style-menu-trigger` and `style-panel-messages`, which the menu does not.
- **A `Load a list` select on the subheading's line**: built on 2026-11-03 and sent back the same day as out of place. It showed an instruction where every neighbour shows a value, and stood beside one of three parallel headings, none of which carries a control.
- **A labelled `Example list` row at `CONTROL_W`, asking in a dialog before replacing typed rows**: built on 2026-11-03 and sent back the same day. The maintainer wants no popups; the pick itself is the confirmation.
- **Asking inline instead, in a row under the field** (K1 to K3 on the lab page, 2026-11-03): each still put a question between the reader and the press they had made.
- **Three equal cells, the field in one** (L1 to L3 on the lab page, 2026-11-03): every name truncates, by the measurement above.
- **The name as a hidden headline in the file**, as the first files carried it: the menu would need a build plugin to read the names without bundling every list's rows into the cold load. The file name costs nothing to read.
- **The row below the box**: offered beside the row above it; the maintainer put it above (2026-11-03).
- **Adding a picked list under the rows already there**: the first replace rule, reversed by the maintainer on 2026-11-03.
- **Offering Undo after a pick**: Undo has nowhere to live, since no message box carries a button (record 0169), and a controlled textarea breaks the browser's own undo.
- **Building the lists into the page's script**: never fails to load, but every visitor carries every list against the cold load's script budget, and dozens of lists would be 100 KB or more.
- **Renaming the subheading to `CSV search` or `Coordinate CSV search`**: "CSV" is jargon to a hiker, the box also takes lines typed by hand, and the rename breaks 0156's three-heading set.
- **Saying nothing on a failed load**, the way the state outlines fail: the maintainer asked for the line (2026-11-03), since a reader who picked a list and saw nothing has no other way to learn why.

## Consequences

A pick over rows the reader typed loses them, with no undo. A share link restores the box's rows and not what arrived, so a reloaded page reads a restored list as `Custom` until a list is picked again; comparing the box against every list on each load would spend a fetch per list to save a word. A new list from the `peakbagger-list-csv` skill lands in `frontend/src/coordinate-lists/` under its menu name, so its file name is a user-facing string the maintainer approves first, and `NOTICES.md` credits its source under Bundled data. When the lists outgrow a screen, the menu takes group headings (#848); nothing is built until they arrive.
