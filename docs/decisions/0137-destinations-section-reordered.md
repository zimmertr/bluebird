# 0137. Destinations reads Map, Coordinates, Polygon, with the map's search as a field in the panel and the three on one pair of edges

- Status: Accepted
- Date: 2026-10-13
- Decider: the maintainer, on #687 (2026-10-13: round 2's direction b, reordered to Map, Coordinates, Polygon, with the `Map` subheading kept; the coordinates line kept with its `#`). Then on the maintainer's first look at #707 the same day: the field's line approved as `Search by name, or select from the map`, Coordinates back to a box two rows tall, and the Polygon row always the same three buttons, so the three inputs share one width
- Issues and PRs: #687, #707
- Cited in code as: #687
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `drawControls.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useMapSearchFocus.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Destinations

## Context

#687's audit found two things in the Destinations section. The Coordinates block (its heading and a three-line textarea with example rows) was always open, 95px of the section's 281px before anyone had pasted anything (P06). And the Map sub-block was a subheading and an italic helper line, 48px with no control in it, because the search box it described is on the map (P07). The maintainer's rule for P07: the helper may go only if the panel still makes it obvious, without the tutorial, that searching adds a destination.

## Decision

- **The order is Map, Coordinates, Polygon**, so the two full-width inputs stand together under their subheadings and the Polygon block (its buttons, the type boxes, Include unnamed peaks) comes last.
- **Map keeps its subheading, and its control is a field**: a `FIELD_TRIGGER` with the map search box's own glyph and the line `Search by name, or select from the map`, which hands the keyboard to the map's search box (`useMapSearchFocus`; on a phone the drawer closes first). The italic helper line is gone, because the field now says it. Hovering the group still points at the search box and the clickable peaks and lakes. The trigger looks like the field it stands for: `FIELD`'s box with its text in `PLACEHOLDER.text`, the step every field's placeholder and the map's search box wear (`PLACEHOLDER.field`).
- **Coordinates is a box two rows tall at rest**, so a reader sees that several rows go in, with the format line and one row that follows it as its placeholder (`# Lat,Lon or Lat,Lon,Name` and `46.8529,-121.7604,Mount Rainier`). The third example row is gone. It is the textarea it was, resizable by its corner, at two rows rather than three.
- **The Polygon row is always the same three buttons**: the mode button (`Draw polygon`, `Edit polygon` or `Done`), `Cancel` and `Clear`, a third of the width each (`DRAW_ROW`), so the Map field, the coordinates box and the row stand on one pair of edges. A button that does nothing is greyed with `DISABLED` rather than missing: Cancel outside the mode, Clear with no point, Done under three points (`drawControls`). The buttons are the two button roles at a 4px inset, because a third is narrower than `Draw polygon` at the roles' 12px. A press that greys the button it landed on hands the keyboard to the first button in the row that can still act (#576, record 0089), and a press that leaves its button live keeps it there.

## Evidence

- The section, measured 2026-10-13 at the default load (no type ticked, so no unnamed-peaks row, which this PR also hides until Peaks is ticked): 281 to 259px at 1440x900, and 354 to 318px on a 390x844 phone and at 360x800, both under touch. With a ring drawn and Peaks ticked it is 323px at 1440x900, as it was.
- The field's line fits on one line at 360px: 225.9px at 12px on a Mac (measured in Chrome on the maintainer's Mac, which put the earlier, longer line at the 250.2px the maintainer measured). The room in the field is its width less its 2px border, its 16px of padding (`px-2`), the 16px glyph and the 8px gap: 275px at 1440x900 (with the panel's 10px scroll bar), 283px at 390x844 and 253px at 360x800 under touch. The container's font sets the line at 213px, so the container's own fit proves nothing about a Mac; the arithmetic above does.
- The three share their edges: 16 to 333px at 1440x900, 16 to 341px at 390x844 and 16 to 311px at 360x800 (measured 2026-10-13). A third of the row is 100.3px, 103px and 93px there. `Draw polygon` is 77.4px on a Mac, so at the roles' 12px inset it needs 101.4px and wraps on a desktop and at 360px; at 4px it needs 85.4px and fits all three.
- `DestinationsSection.test.tsx` holds the order, the field's line, the press handing the keyboard over, the box's two rows and its placeholder, the row's three buttons in every state and where the keyboard goes after each press. `drawControls.test.ts` holds what each button says and whether it can act, case by case. `styles.test.ts` holds `DRAW_ROW` to the two roles and the fit. `useMapSearchFocus.test.tsx` holds the desktop focus and the phone's close-then-focus.

## Alternatives rejected

- **Direction a, three labelled rows in a 72px label column** (round 2): every control kept and no word added, but it saved 16px on a desktop and 2px on a phone, and its search row stood apart from the coordinates.
- **Coordinates as one line until opened** (built in this PR, reversed on the maintainer's first look, 2026-10-13): a one-line `FIELD_TRIGGER` in mono showing the format line, which a press turned into the textarea in place, folding back when emptied and left. It saved 23px at 1440x900 and 14px on a phone over the two-row box, but one line did not show that several rows go in.
- **Coordinates as a closed disclosure** (round 1's P06): a chevron beside the heading hid the format until opened.
- **Only the buttons that can act** (the row's shape since #478): Draw polygon alone at rest, two over a ring, three while drawing. The row changed width under the reader and stood on no edge the fields above it did.
- **Removing the Map sub-block outright** (round 1's P07): searching would then be visible only on the map, which fails the maintainer's rule.

## Consequences

The search box's ref moves from `MapStage` to `App.tsx` so the drawer can reach it. The panel's search field sits on the record 0040 exception for full-width controls, like the coordinates box, the Polygon row and the calendar's field. Two buttons named Cancel can now be on screen together while an analysis runs, the analysis's own and the row's greyed one, so the browser suite presses the one that is enabled.
