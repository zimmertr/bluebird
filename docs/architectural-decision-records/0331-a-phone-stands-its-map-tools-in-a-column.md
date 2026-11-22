# 0331. A phone stands its map tools in a column under the sentence bar

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0328](0328-a-phone-wears-the-sentence-bar.md) (the bar takes the whole first row) and [0147](0147-map-buttons-wear-the-app-chrome.md) (the compass ends the column rather than the chip row).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, choosing a search button in the phone's tool column and keeping the search at the head of the Controls sheet as well
- Issues and PRs: #825
- Cited in code as: record 0331
- Guide: `frontend/src/components/CLAUDE.md` (`MapRows.tsx`, `MapStage.tsx`); `frontend/src/map/CLAUDE.md` (`controls.ts`); `docs/STYLES.md` (`MAP_ROWS`, `MAP_SLOT`, `MAP_EDGE`)

## Context

The prototype's phone keeps its map tools in one column down the map's right edge under the sentence bar, as a desk keeps them in its corner (record 0315). The build's phone stood the 3D and locate buttons at the end of the bar's row, Layers in the chip row beside Legend, the compass at that row's end, and no way to draw a loop from the map. The bar ended 12px short of the 3D button and squeezed its phrases at 360px.

## Decision

- **The bar takes the whole first row** (`MAP_ROWS.pillWide`).
- **The tools stand in a column under it** (`MAP_ROWS.phoneTools`), 12px apart: a search button, Layers, drawing a loop, 3D, locate, and the compass while the map is turned or tilted. Each is a 32px round button (`MAP_SLOT.tool`, `MAP_TOOL.draw`), and Layers is the desk's round tool, its menu a bottom sheet.
- **The search button opens the place search over the bar** (`MAP_ROWS.searchOver`) with the keyboard in it, and reads pressed while it stands. The field goes when a place is picked, when it gives up the keyboard and its list, or on Escape, which hands the keyboard back to the button. The search at the head of the Controls sheet stays.
- **The draw bar ends clear of the column** (`MAP_EDGE.rightOfTools`).
- **The column stands under the results sheet**, on the map chrome's layer beside the rows rather than in them: it runs some 300px down the map, past the rows the sheet's full stop leaves clear, and a raised sheet stands over it. Its Layers menu is a sheet portalled to the page, so the layer does not bound it.
- **The pill search and the Controls chip are gone** from the rows, and `controlsSummary()` with them: no render lacks a bar now.

## Consequences

- The legend's chip has the second row to itself on the left, and the column stands over the map's right edge, as at a desk.
- A phone draws a loop from the map in one press, as a desk does.
- One new string: the search button's name, `Search for a place`, in the PR's strings table.
