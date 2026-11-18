# 0306. Every destination added is a chip in one field, with Search by list and Search by area beside it, and a search can hold several areas and several lists

- Status: Accepted. Supersedes [0137](0137-destinations-section-reordered.md), [0156](0156-destination-subheadings-say-search.md), [0286](0286-list-search-subheading.md) and [0288](0288-list-field-prompts-select-a-list.md) (the section is one field and two buttons, with no subheadings and no Coordinate list field). Amends [0263](0263-coordinate-search-loads-preset-lists.md) (a list is held by its id beside the reader's own rows, not loaded into their box) and [0305](0305-the-controls-stand-as-a-card-over-a-desks-map.md) (the card holds no search, and the Destinations line counts areas and names every list)
- Date: 2026-11-17
- Decider: the maintainer (TJ), who asked on 2026-11-17 for every list, area, searched place and map-picked place to stand as a chip with its × in the Destinations search, with several lists and several areas allowed; who moved the search into the section, named the buttons `Search by list` and `Search by area`, wrote both of their lines, dropped the line about pressing the map, and approved every string below; who chose a middle PR that both of #825's layout PRs build on, one discovery request per area, the phone's Controls sheet carrying the chips, and an area's chip opening it for editing; and who held the PR until a layout is picked
- Issues and PRs: #825
- Cited in code as: record 0306
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `DestinationsSection.tsx`, `DrawReadout.tsx`, `MapRows.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `usePresetLists.ts`, `useDrawMode.ts`, `useDestinationInputs.ts`, `useDestinationCount.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `areasLayer.ts`; [`docs/USAGE.md`](../USAGE.md), Destinations

## Context

The Destinations section had three subsections, each a way in: the map's search pill (Map search), the Coordinate list field over the coordinates box (List search) and the polygon's three buttons (Polygon search). Each held one thing. A second list replaced the first in the box, a second ring replaced the first on the map, and nothing on the panel said which places a search had added. The pill stood on the map, a screen away from the section that named it, which is why the section's hover drew a ring around it.

#825's prototypes tried an Add destination button that opened a menu of kinds. The maintainer kept the idea of adding things one at a time and seeing each, and rejected the menu for searches: five places would be five trips through it. Lists and areas are added rarely and singly, so a button each is fine; places are typed one after another, so the field takes them as it stands.

## Decision

- **One field, every destination in it.** The section opens on a field that holds a chip for every list (`The Bulger List · 100`, its name and its peak count), the reader's own coordinates (`Your own coordinates`), every area (`Area 1 · ~453 km²`) and every place searched by name or pressed on the map. Each chip has its ×. At a desk the search stands in the field under the chips (`Search by name`); a phone keeps its pill on the map, where the keyboard has room, and its field stands only while it holds a chip.
- **Two ways to add the rest.** Under the field, one row of two buttons in one look: `Search by list` opens the lists' menu, with `Your own coordinates` as its last row, and `Search by area` starts a new area. While nothing is added each carries a line saying what it does, `Choose a peak list or provide coordinates` and `Draw a shape and search within it`; once anything is, the lines go and the pair is its names alone. The list button is a new trigger shape, `tile`, because it stands beside a plain button and the pair must read as one.
- **Several areas, up to ten** (`MAX_AREAS`). Each is drawn on the map in the draw colour with its number at its pole of inaccessibility (`map/areasLayer.ts`), the number its chip names. Pressing an area's chip opens that area's ring for editing, framed; Done puts it back in its place and Cancel leaves it as it was. While an area is drawn, Done and Cancel stand in the two buttons' place, with the readout and the area's size over them. Clear went: Cancel and a chip's × cover what it did.
- **One discovery request per area.** `POST /api/destinations` takes one polygon, so the browser asks once an area, one after another, because the pod runs one discovery per address at a time and a second would only wait. The reader's own rows ride the first area's request alone, so the pod resolves each once. The fields join in the browser, a destination two areas share kept once (`mergeDiscovered`). The count ahead of Analyze counts each area on its own and reads them as one field, so a second area costs one more count, not a recount of the first. The area cap holds area by area, read off the largest.
- **One set of kinds for every area.** The kinds stand under the two buttons with `Find in areas` over them, once there is an area or one is being drawn, and greyed until one is usable. `Include unnamed peaks` reads `Unnamed peaks`.
- **Several lists, each held by its id.** A list is fetched on its own (`usePresetLists`) beside the reader's own rows rather than loaded into their box, so several stand at once and each comes off whole. A list that does not arrive is dropped, a link's too, with the message the box's list had.
- **The share link.** `list=` is a comma-separated set of ids, and `poly=` is every area's ring joined by `_`, which no coordinate holds and the query escape leaves as it is. A link with one list or one ring reads as it did. An area the link garbled is dropped with the ring's message and the others open. `customz=` carries the reader's own rows alone.
- **The draw readout.** `Press the map to place points` before the first point, then `2 of 3 points placed`, then `N points placed. Press Done or Analyze.` as before. The panel and the phone's draw bar both show it from the first press.
- **The section's hover lights the map's features alone.** The ring around the map's pill went with the pill's place in the section (`ACCENT_RING`).

- **The desk's card** (record 0305). The search it held under its header is the Destinations field's, so the card holds none, and shut it is hidden whole, the summary chip being the one way back. Its collapsed Destinations line counts the areas rather than one ring's points and names every list: `2 areas · Peaks · The Bulger List · 2 destinations`.

The messages keep their wording: the area cap and the point count still say polygon, because those strings are approved and this PR adds only the ones above.

## Alternatives rejected

- An Add destination button with a menu of kinds: tedious for the case readers repeat, several searches in a row (the maintainer, 2026-11-17).
- A line under the buttons saying a place can be pressed on the map: readers find it, and Add to analysis says so when they do (the maintainer, 2026-11-17).
- One request with every area in it: an API change, for a gain the serialized calls already get, since the pod would discover them one at a time anyway.
- Kinds per area: a second set of checkboxes per chip, for a search nobody asked for.
- Removing an area by pressing its chip: the × does that on every chip, so the press is free to edit.
- Keeping the map's pill at a desk beside the field: two searches for one thing.
