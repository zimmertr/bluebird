# 0286. The second Destinations subheading says List search

- Status: Accepted. Amends [0156](0156-destination-subheadings-say-search.md) (the middle subheading's word) and [0263](0263-coordinate-search-loads-preset-lists.md) (the tour card's wording)
- Date: 2026-11-11
- Decider: the maintainer (TJ), on pull request #903, 2026-11-11
- Issues and PRs: #903, #864, #838, #848
- Cited in code as: #903
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), List search. The two strings live in `WelcomeModal.tsx` and `utils/tourSteps.ts`

## Context

Record 0156 named the three subheadings `Map search`, `Coordinate search` and `Polygon search`, each after what a reader hands the search. When it was written the middle row was a box for pasted coordinates and nothing else.

Since #838 the row is a menu of ready-made lists, and since #848 that menu holds 74 of them. The box for a reader's own rows opens from the menu's last entry, `Custom coordinates`, and most readers never open it. With #864 a share link names a ready-made list by its id (`list=`). The subheading still described the row's secondary use.

## Decision

- **The middle subheading is `List search`.** The other two keep their words, and the order stays Map, List, Polygon.
- **Nothing else in the row is reworded.** The field still rests on `Coordinate list`, the menu's last entry is still `Custom coordinates`, and the Clear button is still named with the subheading, so it is now `Clear List search`.
- A pasted block of coordinates is a list too, so the word is true of both ways into the row.
- **The welcome dialog and the tour lead with the list.** The welcome dialog's Destinations step reads `Search by name, click the map, pick a list, or draw a polygon.` before its second sentence, in the panel's order and with pasting left out. The tour's Destinations card reads `picking a list or pasting your own coordinates` where record 0263 had `pasting exact coordinate pairs or picking a preset list`. `docs/USAGE.md` opens its List search section with the ready-made lists. The maintainer chose each wording on #903, 2026-11-11.

## Evidence

The manifest `frontend/src/coordinate-lists/lists.json` held 74 lists on 2026-11-11. The box stands only once something is in it or `Custom coordinates` was picked (record [0263](0263-coordinate-search-loads-preset-lists.md)).

## Consequences

- `docs/USAGE.md` renames its section, so its anchor moves from `#d-coordinate-search` to `#d-list-search`, and the two links to it move with it.
- Older records keep the word they were written with.
