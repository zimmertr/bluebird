# 0252. Every control that opens a menu is one component with one set of states, and a phone's dropdowns open its sheet

- Status: Accepted. Supersedes 0149's native select (the title stays). Amends 0201 (the field shape is no longer a styled native select) and 0251 (the states are one string). Amended by 0255 (a phone chart has no title: each panel stands its own picker bar, which opens the same sheet).
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #799, 2026-10-30, after finding the chart's metric field and the model picker lit with an accent edge after their menus closed, where Columns was not: "rewrite how these interfaces are constructed so they share a common object in source code. So they literally CANNOT be different." Then "Our sheet everywhere" for a phone's chart metric and aggregates, with each sheet headed by the field's existing name (`Chart metric`, `<metric> aggregate`)
- Issues and PRs: #799, #823
- Cited in code as: record 0252
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `Menu.tsx`, `MapRows.tsx`, `TimeSeriesChart.tsx`, `MetricsTable.tsx`; [`docs/STYLES.md`](../STYLES.md), `MENU_TRIGGER` and the enforcement table
- Related: 0136 (every phone menu is a sheet), 0149 (the phone chart's picker is the plot's title), 0201 (one menu for every trigger), 0208 (the message badge), 0251 (the one hover)

## Context

Record 0251 gave every trigger the same hover and the same open state, and pinned both in tests that read each shape's classes. The pins held for what they named and missed what they did not. The field shape was `SELECT`, a native select's styling, which was `FIELD`, a text input's, and a text input lights its edge on any focus. A menu that closes hands the keyboard back to its trigger, so after a pick the chart's metric field and the model picker stood with an accent edge and an accent label while Columns, a bar button, stood at rest. Three shapes spelled three sets of states, and each new state had to be added three times.

A phone's chart metric and aggregates were native selects (0149), each a second field drawn to look like the first: the chart's an invisible select over a box of its own with a focus edge of its own, the aggregate's a styled select with its chevron beside it in another ink and no faded state. The model picker and the calendar beside them on the same phone opened the app's sheet.

## Decision

- **One string of states.** `TRIGGER_STATE` in `styles.ts` is the hover (`ACCENT.hoverText`), the open state (the accent fill, the label-on-fill ink, the accent edge), the faded state (`DISABLED`) and the keyboard's ring (`FOCUS_RING`), and nothing else. Each shape, `CHIP_FACE`, `TRIGGER_FIELD` and `ACTION_ITEM`, is a surface, a size and a resting ink, ending in it. The field is no longer built on `FIELD`, so it has no focus edge. No trigger has a pressed fill; the chip's was the one.
- **One component.** Every button with `aria-expanded` is a `MenuButton`, the summary chip that raises the Controls sheet included, which wore a role of its own until now. The message badge is the one exception, kept by the maintainer the same day: its severity colour is what it says. A call site gives a trigger layout and width, never a colour or a state; the faded state comes from `disabled` alone.
- **One hover.** `ACCENT.hoverText` is `not-disabled:not-aria-expanded:hover:text-accent-ink` and is the only way any control spells a hover on its label. The bare ×s, the column drag grips, a message's dismiss, the table's sort headers and the popup's × brightened to the strong ink instead, and the bar between the results panels filled grey with a pill that brightened; they light in the accent now.
- **One dropdown on a phone.** The chart's metric and the Metrics rows' aggregates are `MenuSelect` at both widths, a card at a desk and a sheet on a phone, headed by the field's name. There is no native select in the app. The phone chart's title keeps its place and is the field trigger at a phone field's 32px, where the box over a native select was 28.

- **One fade on the map.** Every map button's glyph fades to the accent over 150ms, in and out, as the 3D button's word does: the library's drawing stays on the icon's `before`, so a resting glyph is the drawing it always was, and the same paths as a mask in the accent ink fade in over it on the `after`, the drawing going once the mask covers it. The (i) fades the same way. The compass turns with the map, and a turned layer that fades is resampled on every frame, so its first fade shimmered along the whole needle; it fades no layer. Its north triangle is a mask under the rest of the drawing, and only the triangle's colour moves, by its oklch lightness, chroma and hue, with the hue running down through 0 so the red turns pink and violet on its way to the accent. A colour tweened straight from red to blue passes through grey, which read as a blink; the maintainer chose the violet path the same day from a side-by-side comparison of the two. The swap this replaced, the drawing out and the mask in on the first frame, could not fade: it jumped in and snapped out, and the maintainer saw the zoom and locate buttons flicker beside 3D (2026-10-30, "All fade, compass too").

## Enforcement

- `styles.test.ts`: every shape's state variants are exactly `TRIGGER_STATE`'s, read off its classes, so a shape that gains or loses one fails by name; no shape has a `focus:` state; `ACCENT.hoverText` is pinned.
- `style-menu-trigger`: a button with `aria-expanded` outside `Menu.tsx` and the badge fails.
- `style-trigger-no-look`: a colour utility, a state variant, or `DISABLED`, `FOCUS_RING`, `ACCENT`, `MUTED` or `STATUS` handed to a `MenuButton` or `MenuSelect`, or set inside one, fails.
- `style-hover-accent-only`: a `hover:text-` in any colour but the accent ink fails anywhere the app ships.
- `style-one-menu`: a native `<select>` fails anywhere.
- `styles.test.ts` holds each map glyph's `after` to the accent mask at no opacity with the 150ms fade and the drawing to the `before`; the compass's `before` to the north triangle as a mask, its `after` to its drawing with that triangle unfilled, never faded, and the triangle's three oklch numbers to the needle's red at rest and each theme's accent ink under the pointer, the hue below 0.

## Evidence

Measured 2026-10-30 from the tokens. The popup's × under the pointer reads 5.69:1 on the dark header band and 5.43 on the light one (it read 12.39 and 14.42 in the strong ink). The field's chevron, now in the field's ink, reads 17.12:1 on the light well.

## Alternatives rejected

- Keeping the phone's own picker for the two dropdowns, drawn by a second component built from the same style: two components on a phone where every other dropdown is one, and the drift this record exists to end.
- Lighting the badge while its list is open: the maintainer kept its severity colour.
