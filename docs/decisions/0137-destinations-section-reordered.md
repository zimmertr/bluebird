# 0137. Destinations reads Map, Coordinates, Polygon, with the map's search as a field in the panel and the coordinates as one line until opened

- Status: Accepted
- Date: 2026-10-13
- Decider: the maintainer, on #687 (2026-10-13: round 2's direction b, reordered to Map, Coordinates, Polygon, with the `Map` subheading kept; the field's line approved as `Search by name, or select one from the map`; the coordinates line kept with its `#`)
- Issues and PRs: #687
- Cited in code as: #687
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useMapSearchFocus.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Destinations

## Context

#687's audit found two things in the Destinations section. The Coordinates block (its heading and a three-line textarea with example rows) was always open, 95px of the section's 281px before anyone had pasted anything (P06). And the Map sub-block was a subheading and an italic helper line, 48px with no control in it, because the search box it described is on the map (P07). The maintainer's rule for P07: the helper may go only if the panel still makes it obvious, without the tutorial, that searching adds a destination.

## Decision

- **The order is Map, Coordinates, Polygon**, so the two full-width inputs stand together under their subheadings and the Polygon block (Draw polygon, the type boxes, Include unnamed peaks) comes last.
- **Map keeps its subheading, and its control is a field**: a `FIELD_TRIGGER` with the map search box's own glyph and the line `Search by name, or select one from the map`, which hands the keyboard to the map's search box (`useMapSearchFocus`; on a phone the drawer closes first). The italic helper line is gone, because the field now says it. Hovering the group still points at the search box and the clickable peaks and lakes.
- **Coordinates is one line until opened**: a `FIELD_TRIGGER` in the textarea's mono showing the format line `# Lat,Lon or Lat,Lon,Name`, which a press turns into the textarea in place with the keyboard in it. A list already in state, from a paste or a link, opens it on its own; emptied and left, it folds back. The example rows are gone from the placeholder: the closed line and the open textarea both show the format line and nothing else, written once (`COORDINATES_FORMAT`).
- **The two triggers share one look with the fields they stand for**: `FIELD`'s box with its text in `PLACEHOLDER.text`, the step every field's placeholder and the map's search box wear (`PLACEHOLDER.field`).

## Evidence

- The section, measured 2026-10-13 at the default load (no type ticked, so no unnamed-peaks row, which this PR also hides until Peaks is ticked): 281 to 236px at 1440x900, 354 to 304px on a 390x844 phone under touch, 354 to 304px at 360x800 under touch. With a ring drawn and Peaks ticked, 323 to 300px at 1440x900.
- The field's line fits on one line at 360px: the maintainer measured it at 250.2px at 12px on a Mac. The room in the field is its width less its 2px border, its 16px of padding (`px-2`), the 16px glyph and the 8px gap: 275px at 1440x900 (with the panel's 10px scroll bar), 283px at 390x844 and 253px at 360x800 under touch (measured 2026-10-13). At the search box's own `px-2.5` the 360px figure would be 249px, under the line, which is why the field takes `px-2`. The container's font sets the line at 237px, so the container's own fit proves nothing about a Mac; the arithmetic above does.
- `DestinationsSection.test.tsx` holds the order, the field's line, the press handing the keyboard over, the coordinates line opening the textarea with the keyboard in it, a list in state opening it with the keyboard left alone, and the fold back. `useMapSearchFocus.test.tsx` holds the desktop focus and the phone's close-then-focus.

## Alternatives rejected

- **Direction a, three labelled rows in a 72px label column** (round 2): every control kept and no word added, but it saved 16px on a desktop and 2px on a phone, and its search row stood apart from the coordinates.
- **Coordinates as a closed disclosure** (round 1's P06): a chevron beside the heading hid the format until opened; the one-line field shows it while closed and costs the same height.
- **Removing the Map sub-block outright** (round 1's P07): searching would then be visible only on the map, which fails the maintainer's rule.

## Consequences

The search box's ref moves from `MapStage` to `App.tsx` so the drawer can reach it. The panel's search field sits on the record 0040 exception for full-width controls, like the coordinates line and the calendar's field. The example rows that taught the format by showing it are gone; the format line now carries it alone.
