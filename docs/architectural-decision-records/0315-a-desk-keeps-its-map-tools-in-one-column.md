# 0315. A desk keeps its map tools in one column on the right

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, choosing "One tool column" for the map's controls
- Issues and PRs: #825
- Cited in code as: record 0315
- Guide: `frontend/src/components/CLAUDE.md` (`MapCorner.tsx`, `LayersPopover.tsx`, `MapStage.tsx`)

## Context

The prototype keeps the map's controls in one column on its right edge: Layers, Draw a loop and the zoom pair. The build had Legend and Layers as chips at the top left, and the compass, the 3D button, the locate button and the zoom pair in the bottom-right corner (record 0174), with the compass greyed in place while north was up.

## Decision

At a desk the corner's column gains the tools over the library's buttons (`MapCorner`'s `tools`, `MAP_TOOL.tools`): Layers as a round button named by its glyph (`MENU_TRIGGER.tool`), its card opening to the button's left and growing up from it (`MAP_TOOL.menu`), then a button that draws a ring (`MAP_TOOL.draw`), pressed while one is drawn, a second press letting it go. The compass shows only while the map is turned or tilted. The Layers chip leaves the top-left row.

The draw button draws the polygon the Where card's `Draw polygon` draws, and shares its name, because the prototype's freehand loop is not built yet.

The Legend chip stays at the top left until the legend moves to the foot of the results column.

## Evidence

- `MapCorner.test.tsx` pins the tools over the compass in the column a popup keeps clear of. `LayersPopover.test.tsx` pins the round named button and its card's place. `MapStage.test.tsx` pins Layers in a desk's column and in a phone's rows, and the draw button's press, pressed state and release. `deskMenus.spec.ts` measures the card 8px left of the button with their feet level.

## Open

- The column's buttons keep the map buttons' 32px round face; the prototype's 38px rounded squares come with the tokens and type.
- The freehand loop.
