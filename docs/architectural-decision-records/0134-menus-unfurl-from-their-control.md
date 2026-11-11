# 0134. Every menu unfurls out of the control that opens it, as one card with it at its width

- Status: Superseded by 0201. Amended by 0136 (on a phone every menu is a bottom sheet) and 0174 (a desk chip's menu stands 4px under its chip, unjoined).
- Date: 2026-10-13
- Decider: the maintainer (TJ), on #709
- Issues and PRs: #687, #709, #385, #707
- Cited in code as: #687
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `usePopover.ts` + `Popover.tsx` bullet; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ColumnsPicker.tsx`, `ModelPicker.tsx` and map chrome bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `listbox.ts` bullet; [`docs/STYLES.md`](../STYLES.md), Opening a panel

## Context

Every popover in the app hung beside the control that opened it: a 4px gap under or over the trigger, and a width of the panel's own choosing. The results bar's Columns, Models and Removed lists were 256px wide wherever the button they came from stood, so each opened in a different place, offset from a group of four buttons that reads as one control. The panel's model dropdown was 380px out of a 118px trigger, spilling over the map. The map's Layers menu was its button's width but stood 4px under it (`MAP_COL_GAP.top`). The calendar on #707 is a card that takes its field's place (`cover`).

## Decision

- **A menu unfurls out of the button that opens it, as one card joined to that button, at the button's width.** No menu floats beside, above or offset from its button. The search box's results list is the one exception: it is a list of answers under a text field, not a menu a button opens.
- **The results bar's three menus unfurl out of the whole button group** (`ACTION_GROUP`), not the one button pressed: exactly the group's width, flush with its left edge, the card's top edge on the group's bottom edge. They occupy the same place, so the bar has one place where its menus open.
- **One `placement` option on `popoverBox` and `usePopover`: `'hang' | 'cover' | 'unfurl'`**, with `anchorRef` naming what the card is placed against. `hang` is the old default, beside the trigger; `cover` is #707's calendar, which stands where its field stands; `unfurl` is this rule. #707 shipped `cover` as a boolean and `anchorRef` for the calendar's slot the same day, and the two were made one option when this change merged it, rather than two booleans that could both be set. The trigger still takes the keyboard back and is still exempt from a press outside.
- **Down out of the bottom edge**, scrolling in the room there, while that room is at least `UNFURL_FLOOR_PX` (132px, three 44px rows). Under that floor the card joins the anchor's top edge instead, which a collapsed results sheet on a phone needs: the bar is at the foot of the screen with nothing under it. An unfurled card never shifts over its own anchor.
- **The join is drawn by two roles.** `UNFURLED` drops the card's border and corners on the shared edge, keyed by the side it took (`joined` on the box). `UNFURL_ANCHOR` squares the anchor's corners on that side and gives its border the card's slate-600, read off `data-unfurled`, which `usePopover` writes on the anchor while the card is open. The Layers menu, which hangs in the map column rather than in a portal, writes the attribute on its button itself, and `MAP_COL_GAP.top` goes with its gap.
- **The one qualification** (the orchestrator's proposal of 2026-10-14, pending the maintainer's confirmation): a menu is its control's width, and where the control is narrower than the menu's rows need, the menu takes the control's row instead, still joined to the control. On a phone the results bar's three menus span the bar's line, from its left padding to the group's right edge; on a desk they keep the group's width, which carries its words. The model dropdown spans the Forecast section's content column, the label and control row it stands in, read from the row rather than written as a number, its right edge on the control's so it opens leftward under the label. `usePopover` takes the row as `widthRef` and `popoverBox` as `span`, read only with `placement: 'unfurl'`. A card across a row is wider than its control, so it keeps the border on the shared edge and lays it 1px over the control's, squaring only the corner under the control (`UNFURLED.belowWide`/`aboveWide`); the outer corner stays round where the card stands free under the label.
- **The Columns menu has no heading** (the maintainer, 2026-10-14): `Display columns` repeated the word on the button under it, and the Models menu has none. The list is a group named `Columns`, the button's word, for a screen reader.
- **The linter's `style-menu-unfurls` check** fails a `usePopover` call whose `placement` is not `'unfurl'` (or the calendar's `'cover'`), a `widthRef` on any other placement, so a row width cannot become a way to float, and a `role="listbox"` outside the card `Popover.tsx` draws anywhere but `SearchBox.tsx`. `style-map-layers-column` requires the two roles on the Layers button and its menu.

## Evidence

Measured 2026-10-13 on an image built from this change, Chromium (Playwright 1.63), a 207-peak report:

- **1440x900.** The group is 273.4px wide at the labelled width, and Columns and Models both open at x=1122.6, 273.4px wide, top at y=437, the group's bottom edge, with 0px between them. Columns is 455px tall and fits below. No row is clipped; the widest needs 225px of card.
- **1024x768.** The same group and width. Columns has 227px under the group and 503px over it, and now scrolls in the 227px below, where the hanging rule had flipped it above.
- **Phones, 360, 390 and 430 wide.** The group is its glyphs alone at all three, 136px wide (181px with Removed showing), and the menus open 136px wide on its bottom edge with 243px below. Models fits: `NOAA GFS` needs 95.4px. **Columns does not**: its rows want 210px of card, so at 136px seven of them (`Precipitation · Avg (in/hr)` and its family, the three temperatures) wrap to two lines and their drag grips are pushed out of line. With Removed showing the group is 181px, still 29px short.
- **The panel's model dropdown** unfurls 118px wide out of its trigger. Its rows carry a model's name, a badge, its grid and reach, and a summary, which want 664px unwrapped and were 380px wide floating: at 118px the header `Resolution · range` and the `Recommended` badge are clipped, the summaries run one or two words a line, and a row is 172 to 284px tall.
- **Layers** unfurls out of its 184px button with 0px between them at 1440x900 and 390x844, its button's bottom corners square.

### After the qualification

Measured 2026-10-14 on an image built from the change, the same report:

- **Phone, 390x844 and 360x800.** Columns and Models open 366px and 336px wide, from x=12 (the bar's left padding) to the group's right edge, their top border on the group's bottom one. The Columns rows want 210px of card, so every one of the 29 stands on one line with its grip at both widths, at the touch row's 44px. No row is clipped.
- **The model dropdown** spans its row: 317px at 1440x900, where the panel's classic scroll bar keeps its gutter, and 325px at 390x844, both from the row's left edge (x=16) to the trigger's right edge. The header, `Model` and `Resolution · Range`, and the `Recommended` badge are whole, and every model's first line, name, badge and grid and reach, is one line: the widest, `NOAA GFS` with its badge, is 255.7px. The list wears the shared dark bar (`SCROLL_BARS`) and the model name no longer breaks, which at 1440x900 had split `NOAA GFS` over two lines by 4px under the browser's 15px bar. The summaries run two or three lines, where at 380px they ran two.

## Alternatives rejected

- Keeping the hanging placement and only matching the width: the menus would still float 4px off their control, which is the thing the rule is against.
- Joining the card to the button pressed rather than the group: three menus in three places, each as wide as one glyph on a phone.
- Flipping above whenever above is roomier, the hanging rule's own preference: at 1024x768 that put the Columns list 503px up from a bar the reader is looking down at.

## Consequences

The two places where the rule as first stated cost the content, the Columns list on a phone and the model dropdown, are what the qualification answers; it is the orchestrator's proposal until the maintainer confirms it. On a phone the Columns rows already stand on one line at the bar's width, grips included, so dropping the grips for dragged tiles is not needed to stop them wrapping; whether the 44px rows read too heavy is the maintainer's call. `Popover.test.tsx`, `listbox.test.ts`, `LayersPopover.test.tsx`, `ResultsBar.test.tsx` and `styles.test.ts` hold the placement, the join and the roles, and the linter's fixtures prove both bans fire.
