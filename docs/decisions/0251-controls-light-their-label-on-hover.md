# 0251. Every control on a recessed ground lights its label in the accent under the pointer, and never its edge

- Status: Accepted. Amends 0201 (the triggers' hover loses its edge) and extends it to segments and choice rows.
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #799, 2026-10-30: the hover must show in light, and one hover must hold for every control on a recessed ground. Option 1 of the hover lab for checkbox and radio rows, and the accent label for segments over a fill step, after a fill step on segments stood beside Columns' accent label in the results bar ("the type of inconsistency I hate"). Then, the same day, the label alone everywhere: a dropdown lit its edge with its label beside a segment that lit its label only, and the maintainer chose the segment's way for the dropdowns and the map's Legend and Layers chips too ("These ALL NEED TO BE CONSISTENT"). And the map's round buttons with them, glyphs redrawn for every state in both themes, the compass needle included, with the rule enforced from then on ("all objects MUST BE CONSISTENT and this MUST BE ENFORCED by style requirements moving forward").
- Issues and PRs: #799, #823
- Cited in code as: record 0251
- Guide: [`docs/STYLES.md`](../STYLES.md), `SEGMENT_IDLE`, `CHOICE_ROW`, `COLUMN_GRIP`, the map's chrome, and the enforcement table
- Related: 0147 (the map buttons wear the app's chrome), 0158 (the light theme behind semantic tokens), 0201 (one menu for every trigger, whose hover is the accent label and edge)

## Context

Every segmented control (Current and Dates, All day and Hours, Lowest and Highest, Table, Chart and Both, the player's transport) draws its unchosen half with `SEGMENT_IDLE`. Its hover took the label from `ink-soft` to `ink`. In dark that is slate-400 to slate-200 and reads plainly; in light it is `#42474e` to `#181c21`, two near-blacks on white (1.83:1 between them), and the maintainer could not see it. A checkbox or radio row had no hover of its own, only the browser's on the box, a slightly darker edge, as faint in light.

A fill step on the idle segment was tried first, the same day. It showed in light, but in the results bar it stood beside Columns, whose hover since 0201 is the accent label, so two controls side by side answered the pointer two ways.

## Decision

One hover for every control on a recessed ground: its label takes the accent ink, and its edge stays as it is. Dropdowns, menu triggers, chips and links already lit the label; the dropdowns, the chips and the skip link lit their edge too, and no longer do (`ACCENT.edgeHover` is off `MENU_TRIGGER.field`, `MAP_CHIP` and `BUTTON_FLOATING`). A dropdown still lights its edge while its menu is open, which is its open state rather than a hover. The idle segment (`not-disabled:hover:text-accent-ink`) and the checkbox or radio row (`has-[:enabled]:hover:text-accent-ink` on `CHOICE_ROW`) now do it too, not when disabled. A solid button still deepens its own fill, and a row in a list (a menu option, a table row, a calendar day) still takes a tint. Text fields keep no hover: their focus edge is their cue.

## Evidence

Measured 2026-10-30 from the theme tokens. The accent ink on a segment's recessed fill: 6.45:1 light, 8.17 dark. In light it parts from the resting label by hue; its luminance step is 1.45:1, under the 1.83 that could not be seen, and the accent label on Columns beside it showed plainly in the maintainer's screenshot. On a choice row: 5.74:1 on the light panel, 6.13 on the light menu card, 5.14 on a light menu row's hover fill; 6.71 on the dark panel and card, 4.74 on a dark menu row's hover fill.

The map's round buttons follow it. `map.css` draws every glyph the library paints, the zoom pair, the locate button in each of its states (resting, asking, following, panned away, refused) and the credit's (i), as a mask in its button's own ink, so a glyph is the colour its button's class says: `text-ink` at rest and the accent under the pointer (`MAP_ROUND_BUTTON`, `MAP_ZOOM_PAIR`, `MAP_CREDIT.button`), in either theme from one drawing. Following is the accent and a refusal the danger ink, both tokens; under the pointer a following button deepens to the accent's hover step. The compass keeps its red north and light south at rest, and under the pointer is one shape in the accent. 3D's word lights the same way; while it is on it is a solid button and deepens its fill. A results header's resize grip, whose mark was its own border, draws its line on its `before` and lights it in the accent (`COLUMN_GRIP`). With no edge left lighting anywhere, `ACCENT.edgeHover` is gone.

Enforced from here: the linter's `style-hover-no-edge` fails a `hover:` border, outline or ring in any class string the app ships, behind any variant, and `styles.test.ts` holds `map.css` to the same rule (under the pointer a rule may change a colour or a glyph's mask, and only 3D's solid fill may change its fill) and every map glyph to a mask.

## Alternatives rejected

- A fill step on the idle segment: tried and taken back the same day, for standing beside the accent label of the triggers.
- A fill step on every control, triggers and chips included: reverses 0201's hover across the app for no gain in light.
- Lightening the light theme's `ink-soft` so the label's own step shows: the token sets every caption and placeholder in the app.
- For a choice row, a soft accent halo round the box (Material's way), a row tint, and the label with the halo together (the hover lab): the halo is fussier, and the row tint barely parts from the light panel and needs padding on every row.
- The accent edge with the label on every control, as 0201 had the triggers: the segments' halves share an edge between them, which one half cannot light alone.
