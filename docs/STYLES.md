# Design System

Bluebird Forecast's frontend design lives in `frontend/src/styles.ts`, which exports the roles every component composes. This page documents what each role is for, what is enforced, and the measured numbers that keep the app consistent.

The app has two themes since #706, dark by default and light behind the switch in the panel's header. Every colour role paints a semantic token rather than a palette step (see [Two themes](#two-themes) below), so where a row on this page names a slate or sky step, that is the dark theme's value, and the light one is in that section's table.

## Roles

**Text ramp**

| Role | Purpose |
|---|---|
| `TEXT.appTitle` | Panel identity in the header |
| `TEXT.section` | Panel section headings: 14px bold uppercase in slate-300 (9.83:1 on the panel), brighter than any caption so a heading no longer reads dimmer than the slate-200 subheading under it (#687) |
| `TEXT.subheading` | Named sub-blocks and field labels |
| `TEXT.cta` | Single call-to-action text, step up from body |
| `TEXT.control` | Anything you read or type in a control, and every field label beside one: Model, When, Rank by, Hours, at one weight (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `TEXT.caption` | Secondary text: descriptions, notes |
| `TEXT.helper` | Italic prose explaining a control |
| `TEXT.overline` | Tiny all-caps labels: the model list's group heads and columns, the player's axis |
| `TEXT.micro` | Attribution, timestamps, overflow counts. 11px, the floor for text that is read, and never on a button or a link a reader presses (see The type floor below) |
| `PROSE.title` | Dialog heading, at `TEXT.appTitle`'s 18px so a dialog and the panel name things at one size |
| `PROSE.subtitle` | Line under dialog heading |
| `PROSE.heading` | Heading inside body copy |
| `PROSE.body` | Reading-tier body copy |
| `PROSE.strong` | Inline emphasis (no size, modifies its container) |
| `PROSE.note` | Same as `TEXT.caption`, shared between densities |

**Links**

| Role | Purpose |
|---|---|
| `LINK` | Ambient link: data credits, provider lists, privacy dialog |
| `LINK_ACTION` | A command that stands as words: a menu's Reset all, Restore all and Remove all, a sheet's Done |
| `LINK_QUIET` | A link inside content, in its text's colour: the results table's names, linked values and footnote marks. Underlined on hover and focus at a desk, and faintly at rest on touch |

**Surfaces**

| Role | Purpose |
|---|---|
| `SURFACE_PAGE` | The ground a full page stands on: the app's root, the standalone pages' frame, and the error boundary's fallback, which replaces the tree it guards and so cannot borrow a ground from it |
| `ELEVATION` | The three shadows the app lifts a surface by: `none` for what stands on an edge, `raised` for what rests on the map, `overlay` for what opens above other chrome. Every surface below composes one (see The elevation scale below) |
| `SURFACE_CARD` | Opaque cards above a scrim: dialogs, analysis overlay |
| `SURFACE_FLOATING` | Boxes floating over the map: search field, chart tooltip, the forecast player's transport bar |
| `RECESSED_FILL` | The well every recessed surface composes: slate-900 fill, edged by a slate-500 border (`RECESSED_EDGE`; both private to `styles.ts`, because only roles compose them), which clears 3:1 against the panel. Fields, selects, segments and the legend all start here |
| `SURFACE_CHIP_CARD` | The card a desk's menus stand on: `key` for the legend card, and `menu` for the Layers menu and every other menu, the search list included. One opaque fill, the chips' colour without their 95%, and one outline, the structural slate-500 edge rather than the quiet frame, so where a menu opens across the legend card its edge parts the two (3.07:1 dark, 4.24:1 light). Only the shadow differs: `raised` for the legend, `overlay` for a menu over it. It also carries `MOTION.menu` |
| `SURFACE_SHEET` | The results on a phone, standing on the map's bottom edge: the docked panel's fill, the map's floating edge, the surface radius on the top corners only |
| `CALENDAR_FIELD` | The calendar's field under Dates: a field-shaped trigger that may wrap to two lines, the one panel control allowed to, because the longest window (an hourly one with a year) cannot fit its text room and an ellipsis cut off the end time. Top-aligned, with the chevron pinned to the first line, so one line looks like any other field (#687, record 0129) |
| `CALENDAR_GROUND` | The calendar's ground inside its menu card: the recessed slate-900 fill without a border, since the card draws the edge, so `DAY.range` keeps its 1.28:1 against the ground where slate-800 would leave it 1.05:1 (#687, record 0129). It scrolls with `SCROLL_BARS` when a short window caps the card |
| `SURFACE_DIVIDER` | The quiet rule between two blocks of one surface, where the panel's stack cannot draw it: a dialog header over its body, a menu's foot under its rows, the month bar under the calendar's Hours row. A bare colour, so the call site supplies the side |

**Buttons**

| Role | Purpose |
|---|---|
| `BUTTON_PRIMARY` | Full-width main action: the Analyze button, which reads `Try again` after a failed run (record 0169) |
| `BUTTON_SECONDARY` | Secondary action beside something else |
| `BUTTON_ACCENT` | Leading action in a pair: Done button in draw mode |
| `DRAW_ROW` | The Polygon row: three equal buttons in a grid, `BUTTON_SECONDARY` and `BUTTON_ACCENT` at a 4px inset, because a third of the panel is narrower than `Draw polygon` at their 12px (#687, record 0137) |
| `ACTION_GROUP` / `ACTION_ITEM` | The results bar's Columns, Models, Removed and Download CSV as one group in the mode switch's look: the same bordered well, the same half and height, the same idle fill, a divider between each two, and a 6px inset so a glyph alone is 28px wide and passes target spacing on a fine pointer. They were underlined links, then ghost buttons that wrapped to three rows on a phone. Under a finger each is 44 wide and 32 tall, and presses 44 (`BAR_PRESS`) |
| `BAR_GROUP` / `BAR_PRESS` | The results bar's two groups on a finger: `SEGMENT_FLUID`'s well without its clip, and a pseudo-element 6px over and under each button so a 32px button presses 44, as a chip does. The end buttons round their own outer corners at 3px, the group's 4px less its edge (record [0223](decisions/0223-finger-controls-draw-32.md)) |
| `BAR_LABEL` | Every word on the results bar, the switch's three and the buttons' four: shown only where the bar's content is 584px or wider, the measured line of both groups labelled with Removed showing; under it each control is its glyph, named by its word |
| `DIALOG_FOOT` | The welcome dialog's actions, in a foot that sticks to the card's bottom edge while the body scrolls. `secondary` is the tutorial button: the primary's 14px semibold label, padding and 8px corners in the secondary fill (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `BUTTON_FLOATING` | Pressable floating box: the skip link's look since the map's buttons became chips (#714) |
| `SKIP_LINK` | The page's first Tab stop, the floating button shown only while it has the keyboard. Transparent and unpressable while idle rather than `sr-only`, because `sr-only` sets a position of its own (#576) |
| `BANNER_PREVIEW` | The preview-deployment banner, the one surface that is deliberately loud: white on red-600, 4.76:1 |

**Fields and controls**

| Role | Purpose |
|---|---|
| `FIELD` | Text input, recessed fill with border |
| `FIELD_NUMERIC` | Number input with browser spinners suppressed |
| `SELECT` | A field you choose from: recessed fill with suppressed platform chrome, worn by a phone's native selects and by the field shape of a desk's menu triggers |
| `DISABLED` | The faded, unpressable look of a control that does not apply; composes over any button or field role and carries no color of its own |
| `MUTED` | The other half of that pair: a control that is not the one in force but still works. 60% against `DISABLED`'s 40%, unscoped, and no cursor change, because a press still does something. 60 rather than 50 because a working control's text owes 4.5:1: the slate-200 label measures 5.26:1 on the panel, 5.98:1 on an idle metric select and 5.41:1 on an unplotted chart chip, where 50% was 4.14, 4.61 and 4.23. The fade is the `--ui-muted` token, 65% in light, where 60% leaves the dark ink at 4.31, 4.50 and 4.38 and 65% measures 5.07, 5.34 and 5.10 (#706) |
| `SR_ONLY` | Text for assistive technology only: the twin of an approved tooltip, the one sentence a row's metric links are described by, and a live region that must exist before it speaks |
| `CHOICE_ROW` | Radio or checkbox and its label as one strip |
| `CHOICE_INPUT` | The box itself inside a choice row |
| `SEGMENT` | Geometry of a panel segmented control (fixed to `CONTROL_W`) |
| `SEGMENT_FILL` | Segmented control sized by the box it is placed in, for a row whose column is not the panel's (the Metrics direction row) |
| `SEGMENT_FLUID` | Segmented control outside the panel column, sized by content |
| `SEGMENT_IDLE` | Unchosen half of segmented control |
| `SEGMENT_ITEM` | Individual segment half with padding and transitions |
| `SEGMENT_DIVIDER` | The rule between two segment halves |
| `CONTROL_SIZE` | The one type size every control reads at (`text-xs`); `SLIDER.value` and `SLIDER.wordmark` compose it |
| `SELECT_W_AGGREGATE` | The aggregate menu in a Metrics row: 72px (w-[4.5rem]), the widest aggregate word (28px) plus the field's 8px padding and the 24px `SELECT` reserves for its chevron, with 12px of deliberate slack because the width also sets a grid track |
| `CAPTION_LIFTED` | `TEXT.caption` re-derived for the slate-700 fills: the window caption on the results sheet's header bar, and a search result's description, which stood on slate-700 until the search list took the menu card. slate-300 (6.97:1) because slate-400 falls to 3.93:1 on that fill |
| `SEARCH_KIND` | A search result's kind beside its name: `CAPTION_LIFTED` at the heading weight, 600, so places with similar names read apart by what each one is (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `SLIDER` | The parts of the two range inputs that are not the input itself, one object since #687: `overlay`, `value`, `wordmark` and `idle` are the coverage slider in the Layers popover (the transparent range input laid over the drawn track, the value readout at `CONTROL_SIZE`, the in-track wordmark at the same size in sentence case, and the idle tint), `well` is the recessed well that slider's layers stack in, and `track` is the rail the map timeline's scrubber slides on |
| `PANEL_EDGE` / `PANEL_RULE` | The panel's own border tint (the rule under the header, the one over the footer, and since #697 the panel's right edge against the map and the results), and the rule between the panel's sections, drawn from the stack so a section added later cannot forget its line. `SURFACE_DIVIDER` above is the same quiet line where a call site has to place it by hand |
| `PANEL_BODY` | The panel's scrolling body: `px-4 py-4`, the shared bar with its width kept (`scrollbar-gutter: stable`, so the column never jumps when a section opens), and both scroll shadows reaching across the padding |
| `PANEL_HEADER` | The panel's header, 56px plus its rule: a 40px logo with 8px around it, and the title block at `py-2`. It was 81px (#687). `actions` is the top-right spot its round buttons share, the theme switch on the close button's left (#706). `actions` stands 12px down so the buttons centre at 28px with the logo (record [0226](decisions/0226-header-lockup-centred-tagline-italic.md)), and `title` starts the name and the tagline together at the left: the maintainer tried them centred, with the tagline in italics, and had both put back (record [0229](decisions/0229-header-left-upright-no-the.md)) |
| `HEADER_BUTTON` | A round button in a panel's header: the desk panel's close button and the theme switch, and the switch again beside Done in a phone's Controls sheet title row (`BOTTOM_SHEET.actions`). A 32px circle on either pointer, a finger's height and no wider, where `TAP.action`'s 44px width would draw a capsule (record [0223](decisions/0223-finger-controls-draw-32.md)). The close button's recipe, named once it had a twin (#706) |
| `SCROLL_BARS` | The one scroll bar every dark surface wears: the panel body, the results table, the chart legend, the calendar's popover. The rules live in `index.css` as `.surface-scrollbars`, in the `edge` and `panel` tokens (slate-500 on slate-800 in dark); the root's `color-scheme` turns every bar it does not reach to the theme too (#697, record 0128) |
| `SCROLL_SHADOW` | A slate-950 shade at 70% (in light, the ink at 12%) over 12px under a fixed edge, shown only while content continues past it: `start`, `end`, `both`, and `head` for the results table, whose top shade hangs under its sticky header. CSS scroll timelines where the browser has them, `useScrollShadows`'s two data attributes where it does not (#697, record 0128) |
| `METRIC_LABEL_PITCH` | 5px above and below each metric's radio label on a fine pointer, which sets the Metrics rows 32px apart so the radio and the boxes pass WCAG 2.2's 24px target spacing without growing; nothing under touch, where `TAP.row` already makes the label a finger's 32px (#687, record 0130, record [0223](decisions/0223-finger-controls-draw-32.md)) |
| `MOTION` | Movement that answers an action and stops under a reduced-motion setting, at two speeds (#714): `menu` at 150ms for a menu or a card, a fade and a 4px slide from its trigger's side and back, with a closed card kept for its exit by `useExit`, and at 300ms `slide` for the phone's Controls sheet, `push` for the desk panel and `pane` for a results pane on a press or the collapse chevron, each naming the one property it moves. `progress` is the analysis card's bar (#687). `PANEL_MS` is the slower speed in numbers, for script that waits out a move. The tutorial wears no transition: at a desk its light and card glide in script (`glide` in `tour/place.ts`), and on a phone it cuts from card to card and stands every transition in the app down while it runs (`data-touring="cut"`, record [0214](decisions/0214-phone-tour-cuts-desk-tour-glides.md)) |
| `DESK_PANEL` | The controls panel at a desk: a 360px column in the row beside the map, which stays in the row while shut and gives its width back through its left margin (`shut`), so the map's edge moves with the panel's (#714) |
| `RESULTS_PANE` | A results pane at a desk, the chart or the table with its grip: a one-row grid frame, `1fr` open and `0fr` shut, around a body mounted at the press at the height it will stand at and kept, inert, while the pane is shut (#786), held to the results bar (`top`, the chart) or to the column's foot (`foot`, the table) (#714) |
| `CHART_LEGEND` | The chart-only legend: one chip per charted line, two rows of chips at most, then it scrolls. At a desk it is a results pane of its own between the chart's and the table's, held to the foot, so Chart to Both shuts it as the table opens; on a phone it stands in the chart's box. Its tallest strip fits inside the table's floor, which a desk's Chart keeps free under the chart (#795) |
| `LAYOUT_HOLD` | What keeps one size while a desk's layout moves (#714): the map's box at the window's width or height, centred on its column, which clips it (`clip`); the table's box at the window's width and the chart at the width it had while the panel moves. `rest` is the map's box the rest of the time. `layer` puts what moves with the panel on a layer of its own while it moves: the panel, the map's column, the results and each pane's body (#786) |
| `BADGE_STEP` | The step-number badge in the welcome modal, derived from `ACCENT.fill` |
| `SWATCH_CHIP` | A legend swatch that carries a letter: the smoke section's three density chips, side by side so the opacity ramp reads against itself. 16px square around a 10px letter, the one size under the type floor (`GLYPH_SIZE`, private to `styles.ts`), which the strip's numerals in `SWATCH_RAMP_TICK` share |
| `SWATCH_STAR` | A legend swatch that is a starburst with its label inside: the fire activity section's three age chips, `12h`, `24h` and `48h`, on one line like the smoke chips (#799). 24px, so the label sits inside the star's inner corners, in `SWATCH_CHIP`'s glyph, which clears 4.5:1 on all three fills. The star is an inline SVG filled from `utils/fireActivity.ts` |
| `SWATCH_RAMP` / `SWATCH_RAMP_SCRIM` / `SWATCH_RAMP_TICK` / `SWATCH_EDGE` | A legend key that is a SCALE rather than one colour, drawn as a strip across the box: every metric's scale and the snow depth layer (#454). ONE line whatever the band count, where a row per band was seven lines and eleven. The numbers stand INSIDE the strip on the band boundaries they name, which is a grid over the strip rather than a row under it, so a five-band key costs a label and 20px. `SWATCH_RAMP_SCRIM` is the slate-900/70 band they stand on and `SWATCH_RAMP_TICK` the slate-200 they are drawn in; see the contrast rule below for why the scrim is not optional. `SWATCH_EDGE` is the slate-600 every swatch is edged with, a VALUE rather than a class because the fill beside it is inline and two colour utilities resolve by stylesheet order |

**Accent and intent**

| Role | Purpose |
|---|---|
| `ACCENT.fill` | Solid block with label: segment, button, selected calendar day |
| `ACCENT.fillHover` | Hover state for fill buttons |
| `ACCENT.mark` | Bare graphic with nothing on it: progress bar fill |
| `ACCENT.input` | Native checkbox/radio tint and sizing |
| `ACCENT.text` | Resting accent text: table detail-sort arrow |
| `ACCENT.hoverText` | Text reaching for accent on hover |
| `ACCENT.edgeHover` | Border reaching for accent on hover |
| `ACCENT.edgeFocus` | Border on focus-within |
| `FOCUS_RING` | Visible keyboard-focus outline |
| `FOCUS_RING_INSET` | The same outline drawn inside the edge: the results table's sticky headers, where an outer ring is clipped by the scroll box and lands on the first row (sky-400 is 4.75:1 on the slate-700 bar) |
| `ACCENT_RING` | Ring pointing at a control from across the screen |
| `BADGE_ACCENT` | Word marking a row: "Recommended" badge |
| `CHIP.rest` | A selected member of a set that is not the one in force: a compared forecast model |
| `CHIP.active` | The member in force, on `ACCENT.fill`; the remove x is the second channel carrying that state |
| `CHIP.label` | The chip's label, which is also the control that puts that member in force |
| `CHIP.remove` | The x that deselects it: a 20x24 box, widened to WCAG 2.5.8's 24x24 target on a coarse pointer, with the four pixels taken back out of the layout |

**Status**

| Role | Purpose |
|---|---|
| `STATUS.ok` | Polygon closed, ready state |
| `STATUS.warn` | Survivable but worth knowing about |
| `STATUS.error` | Blocking failure |
| `STATUS.info` | Neutral fact about the data |
| `NOTICE.warn` | Boxed warning message |
| `NOTICE.error` | Boxed error message |
| `NOTICE.info` | Boxed info message |
| `NOTICE_DISMISS` | The X that dismisses one message in the list the Analyze button opens; hidden until its row is hovered, always visible on touch, and absent from a blocker's row |
| `NOTICE_DIVIDER` | The rule between two messages in one notice box: the box's own border tint, 6px clear on each side, and no rule at all under a lone message |

**Spacing and sizing**

| Role | Purpose |
|---|---|
| `RADIUS.control` | Form controls, small buttons, inline chips |
| `RADIUS.surface` | Floating cards, dropdowns |
| `RADIUS.pill` | Pills, dots, spinners, progress bars |
| `TAP.action` | Button-shaped tap target: 32px tall and 44 wide on coarse pointers (record [0223](decisions/0223-finger-controls-draw-32.md)) |
| `TAP.row` | Left-aligned tap target: 32px height on coarse pointers |
| `TAP.height` | Height-only tap target for already-laid-out content |
| `TAP.grip` | Full-width drag handle: 24px height (AA floor, not a finger's 32) |
| `CONTROL_W` | Single stacked panel control width: 118px, which is 2 x `METRIC_BOX_W` plus the Metrics grid gap, so the whole panel stands on the bound boxes' edges |
| `CHART_METRIC_W` | The chart's metric menu, 152px (w-38). The one control that borrowed `CONTROL_W` from outside the panel and cannot follow it down: its labels carry an hour's unit, and `Precipitation (in/hr)` is 109.03px (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `MAP_MENU_W` | Width of both chip menus, Layers and the desk's legend card: 224px (w-56) since #799. The fire activity key's one line needs 213.4px with the card's padding, the legend's wait line 176.8px and the longest Layers row, `Forecast player`, 130.0px |
| `MAP_CHIP_MENU` | Where a chip's menu stands at a desk: a whole card from the chip's left edge, 4px under it, at `MAP_MENU_W`. That is closer than the 8px between the pill and the chip row, so the card reads as its chip's menu and not as another row. Not joined: the chip keeps its pill and is lit while the card is out. The caller picks the surface: `SURFACE_CHIP_CARD.menu` for the Layers menu, `.key` for the legend card. Every other desk menu copies this card |
| `MENU_TRIGGER` | The three trigger shapes, on purpose: `chip` for a pill on the map, `field` for a field in the panel or over the chart, `bar` for a button in the results bar's group. Each takes the accent on its edge and label under the pointer (the bar button on its label alone, since it has no edge of its own), and while its menu is out the chip and the bar button light in the accent fill and the field keeps its accent edge. `MenuButton` in `components/Menu.tsx` is the only wearer |
| `MENU_CHEVRON` | Where each shape's chevron stands: `IconChevron` after the label, down while the menu is shut and up while it is open. The chip's is pulled 4px into its padding and the bar button's 2px, so each sits as far from the right edge as the label does from the left; the field's stands in `ICON_ADORNMENT`'s place and takes the accent with the edge. A phone's chips and bar buttons have none, because their sheets rise from below |
| `MENU` | The parts of the one menu: `card` (the chip card's `menu` surface on `LAYER.popover`), `foot` (a foot ruled off by `SURFACE_DIVIDER`; a menu has no header, its trigger names it, record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)), `list` (the scrolling rows on `SCROLL_BARS`), `row` and `option` (the Layers menu's 10px inset, `option` adding the control size and the touch row for a list you pick from), `cardRow` (a Layers row's inset, pulled out so its fill starts where a list row's does, 20px apart like every menu's rows), `active` (the raised fill under the pointer or the keyboard), `hover` (the same fill on every enabled checkbox row) and `current` (the value a field shows, in semibold, with no check mark) |
| `MODEL_ROW` | A row of the model list: the box first, a hairline (`SURFACE_DIVIDER`) between rows with 8px over and under each, every name semibold (`name`). The fill follows a mouse (`MENU.hover`) and the keyboard while the list shows its ring (`keys`, through `list`'s `group/list`), never a finger (record [0225](decisions/0225-model-rows-box-first-ruled.md)) |
| `DRAW_BAR` | The draw bar on a phone: the polygon readout, Done and Cancel on the map while a ring is drawn, a floating box at the map's inset off both sides, standing where the player stands. A desk keeps them in the docked panel |
| `MAP_EDGE` | How far anything floating on the map stands off its edge: 12px, published once as `--map-edge-inset` on the map wrapper and read by the map's rows and MapLibre's own control stack; `left` and `right` are the inset as utilities. The same publisher carries `--map-credit-size` at the ramp's smallest step, so `map.css` can size the library's credit line from the ramp |
| `MICRO_SIZE` | The ramp's smallest step as a utility, 11px since #687. `MAP_EDGE.publish` spells the same 11px a second time as a custom property, and `CHART_TICK_PX` a third as the number Recharts takes, because Tailwind compiles no interpolated class and the library's credit line has no call site; `styles.test.ts` holds the two to one number |
| `METRICS_GRID` | The Metrics table: label, aggregate menu, Min box, Max box; the control columns are `auto`, sized by the roles their controls wear |
| `METRIC_BOX_W` | One bound box in the Metrics table: 56px (w-14), the widest the metric row's label budget allows. The results cap spans both box columns instead, so it wears `w-full` off the same shape |
| `METRIC_HEAD_GAP` | The Metrics table's one deliberate break: 8px (pt-2) above the two box headings, on every cell of that row because the columns are grid tracks. The only vertical space in the grid that `gap-y` does not set |

**Moving a column**

One `DRAG` object for both surfaces that reorder columns (five exports until #687), the table header and the Columns picker, so a gesture that means "this moves" looks the same in either.

| Role | Purpose |
|---|---|
| `DRAG.grip` | The handle itself. `cursor-grab` is the standing signal; `touch-none` is load-bearing, because without it the browser claims the gesture for scrolling and the drag never gets a second pointer event on a phone |
| `DRAG.gripActive` | The grip while its own column is the one being carried |
| `DRAG.carried` | The column where it used to be, while the ghost is under the pointer. `DISABLED`'s 40 percent without its cursor, because that column still sorts the moment the drag ends, and not `MUTED`'s 60, because it is faded for where it is rather than for what it does |
| `DRAG.ghost` | The column riding under the pointer. Portalled to the body and positioned in viewport coordinates, so it carries `LAYER.popover` itself rather than asking the call site for it, and the `ELEVATION.overlay` shadow every opened surface wears; `pointer-events-none` is load-bearing, or the ghost is what every hit test finds |
| `DRAG.insert` | The bar marking the gap the column will drop into. The accent's fill without its label color, since the bar carries no text, and the same layer as the ghost |

**Map timeline**

| Role | Purpose |
|---|---|
| `SCRUBBER` | The timeline's `<input type="range">`: suppresses the platform slider on every engine that draws one, and draws the thumb |
| `SLIDER.track` | The rail behind it, on the same recessed surface as every other well. It was `SCRUBBER_TRACK` until #687 grouped the slider parts |
| `TRANSPORT_AXIS_ITEM` | The axis switch's halves: `SEGMENT_ITEM` with one step more inset, because the right half carries a ranked metric's noun rather than a word the app chose. That half also holds one line and takes the width its own noun needs, where a panel half splits a fixed box with its neighbour |
| `TRANSPORT_PLAY` | The player's play button: 28px square on a fine pointer and a finger's 32 on touch, square on both, where `TAP.action` would stretch it to 44 wide (record [0223](decisions/0223-finger-controls-draw-32.md)) |
| `TRANSPORT_AXIS_W` | Private to `styles.ts` since #687, composed into `TRANSPORT_AXIS_ITEM`. The floor under both halves: the width `Radar` takes, so a one-word metric beside it is a matching half rather than a runt. Spelled again under `touch:`, because the tap target's own min-width is a later rule and would otherwise lower it |

**Layers**

| Role | Purpose |
|---|---|
| `LAYER.base` | Map chrome, sticky header, docked panels |
| `LAYER.sheet` | The phone results sheet: over the map chrome it covers, under the drawer's scrim |
| `LAYER.mapControls` | The map's top-left cluster and what it opens: over the sheet and the map chrome the Layers popover hangs across |
| `LAYER.overlay` | Analysis overlay card |
| `LAYER.scrim` | The Controls sheet's dim: over the map, its chrome and the results sheet |
| `LAYER.drawer` | The panel: a phone's Controls sheet |
| `LAYER.popover` | Every menu `Menu.tsx` draws, and every phone bottom sheet (above the panel, below modal) |
| `LAYER.modal` | Modal dialogs |

**Calendar days**

| Role | Purpose |
|---|---|
| `DAY.cell` | Calendar day cell box: 28px on a fine pointer, 32px under touch (#687, record [0223](decisions/0223-finger-controls-draw-32.md)) |
| `DAY.head` | The weekday initials over the grid, kept at the 36px the day rows had, on either pointer |
| `DAY.full` | Full data available (weather and AQI) |
| `DAY.partial` | Weather only (past air-quality horizon) |
| `DAY.unservable` | Outside servable band, inactive |
| `DAY.range` | Fill for days between selected ends |
| `DAY.selected` | Accent fill for selected ends and single picks |
| `DAY.today` | Ring marking today (can stack with other states) |

**Icons and tables**

| Role | Purpose |
|---|---|
| `ICON` | How big a drawn glyph is, in four steps: `control` 16 (in or beside a control, the search magnifier included), `inline` 14 (a mark inside a line of text), `chip` 12 (a chip's remove cross, either chip), `micro` 10 (inside a drawn disc or button smaller than a control). Read by `components/icons.tsx`, which draws every icon in the app; every step carries the measurement that chose it |
| `ICON_BUTTON` | Bare icon button in header, and the bare × inside a card or a field: the popup's, the tutorial's, the search's (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `ICON_CLOSE_BUTTON` | `ICON_BUTTON` for a × with free room around it, the tutorial card's and the search's clear: a 44px press under a finger through a pseudo-element, without growing the glyph |
| `ICON_ACTION` | Icon that acts on hover |
| `ICON_ADORNMENT` | Glyph drawn inside a field |
| `SPINNER` | Indeterminate spinner |
| `TABLE.cell` | Results table cell inset |
| `TABLE.row` | One data row: the rule above it and what it does under a pointer. Both the pending destinations and the ranked results wear it |
| `TABLE.head` | Results table header cell |
| `TABLE.number` / `TABLE.headNumber` | A number column's cell and header, right-aligned so the digits and the label end on one edge: elevation, the wildfire distance and every metric. Type is a word and stays in the sans (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `TABLE.rankStack` | Rank cell: number and remove × in one grid cell, so the column never changes width on hover |
| `TABLE.rankFace` | One face of that stack, pinned to the shared cell |
| `TABLE.rankIdleFace` / `TABLE.removeFace` | Which face shows: the number gives way on row hover and while the × has keyboard focus. The × idles at no opacity rather than `invisible`, because a hidden element cannot take focus (#576) |

## Two themes

Dark is the default and stays the default whatever the operating system says;
light applies only once a reader presses the switch (#706). The two are one set
of names with two sets of values, so no role is spelled twice.
Record: [0158](decisions/0158-light-theme-behind-semantic-tokens.md)

**How it is built.** `frontend/src/index.css` registers each token in an
`@theme inline` block as `--color-<token>: var(--ui-<token>)`, which gives it a
Tailwind utility (`bg-panel`, `text-ink-soft`, `border-edge`) that compiles to
the variable rather than to a value. `:root` sets every `--ui-*` to the Tailwind
step the dark theme always painted, and `:root[data-theme="light"]` sets them to
the light palette. It has to be `inline`: a plain `@theme` entry pointing at
another variable resolves once on the root, and an override on the same root
would never reach it. Opacity modifiers still work (`bg-floating/95`), because
v4 compiles them to a `color-mix` over the variable. Three values are not
utilities and ride the same block as plain variables: the accent ring's glow
(`--ui-accent-glow`), a legend swatch's inline edge (`--ui-swatch-edge`, which
`SWATCH_EDGE` hands to a `style`), and `MUTED`'s fade (`--ui-muted`).

| Token | Dark | Light | Roles that paint it |
|---|---|---|---|
| `page` | slate-900 | `#f8f9ff` | `SURFACE_PAGE` |
| `panel` | slate-800 | `#eef2f9` | the panel, `SURFACE_SHEET`, `SURFACE_CARD`, the chart and table body |
| `raised` / `raised-hover` | slate-700 / slate-600 | `#e1e6ee` / `#d4dae3` | `MENU.active`, the results bar, the table head, `BUTTON_SECONDARY`, `CHIP.rest`, `HEADER_BUTTON` |
| `highlight` | slate-600 at 50% | `#d4dae3` | a search result under the keyboard |
| `floating` | slate-800 | `#f8f9ff` | `SURFACE_FLOATING` at 95%, and `SURFACE_CHIP_CARD` opaque |
| `recessed` | slate-900 | `#ffffff` | `RECESSED_FILL` and every well that composes it |
| `rule` | slate-700 | `#c2c8d1` | `SURFACE_DIVIDER`, `PANEL_RULE`, `TABLE.row` at 50% |
| `frame` | slate-600 | `#9aa0a8` | a phone sheet's top rule, the results sheet's strip, a popup's inner rules (`--popup-rule`). No floating card wears it: 1.93:1 dark and 2.51:1 light on a card's own fill, under the 3:1 a boundary owes (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)) |
| `edge` / `edge-lifted` | slate-500 / slate-400 | `#72787f` / `#72787f` | `PANEL_EDGE`, `RECESSED_EDGE`, `SEGMENT_DIVIDER`, `SURFACE_CHIP_CARD`, `SURFACE_FLOATING`, `SURFACE_CARD`, the chips, the map's buttons, `POPUP_FACE`, the scroll thumb; the marker popup's scroll thumb |
| `ink-strong` / `ink` | white / slate-200 | `#181c21` / `#181c21` | headings and the primary text |
| `ink-mid` | slate-300 | `#2d3238` | `LINK`, `TEXT.micro`, `CAPTION_LIFTED`, `TEXT.section` |
| `ink-soft` | slate-400 | `#42474e` | captions, `SEGMENT_IDLE`, `ICON_ADORNMENT`, placeholders |
| `ink-faint` / `ink-ghost` | slate-500 / slate-600 | `#6c727a` / `#a0a6ae` | `ICON_ACTION` at rest; `DAY.unservable` |
| `accent` / `accent-hover` | sky-650 / sky-600 | sky-650 / `#00639b` | `ACCENT.fill`, `BUTTON_PRIMARY`, `BADGE_STEP` |
| `accent-ink` / `accent-ink-hover` | sky-400 / sky-300 | `#00639b` / `#004a75` | `LINK_ACTION`, `ACCENT.text`, `FOCUS_RING` |
| `mark` | sky-500 | sky-650 | `ACCENT.input`, `ACCENT.mark` |
| `range` / `range-hover` | sky-950 / sky-900 | `#cfe5ff` / `#bcdafc` | `DAY.range` |
| `on-fill` | white | `#ffffff` | the label on any fill |
| `ok`, `warn`, `danger`, `info` | green-400, amber-300, red-400, sky-300 | `#1d6b33`, `#973c00`, `#93000a`, `#0b4a73` | `STATUS`, the `NOTICE` inks |
| `*-tint` / `*-line` | the hue's 950 at 40% / 800 at 60% | `#fbe7c4`, `#ffdad6`, `#d6e7fb` / the ink at 38% over its tint | the `NOTICE` boxes |
| `lift`, `thumb`, `scrim` | white, white, black | `#181c21`, `#181c21`, black | a hovered row's tint, a range thumb, the dim under a modal |

The light values are the maintainer's palette from #706, the Material light
preset; the ones it left to derive (the middle and faint inks, `frame` halfway
between `rule` and `edge`, the range hover, the shade, the thumb) are measured
below. `SWATCH_CHIP` keeps `text-slate-900` in both themes on purpose: its
letter stands on the smoke key's own chip colour, which does not change.

**The switch.** `ThemeButton` is a round `HEADER_BUTTON` beside the close button
at a desk and beside Done in a phone's Controls sheet title row; no other sheet
shows it. Its glyph is the theme a press goes to, a sun while dark and a moon
while light, and its name says the same. `useTheme` writes `data-theme` on the
root and the choice to `bluebird_forecast_theme` in localStorage (`viewPrefs.ts`),
and stores nothing for dark. The choice is not in the URL: a link carries a
session, not a browser's habit. A page would paint dark for a frame before React
read the key, so `frontend/public/theme.js` (291 bytes, a classic script on the
same origin, which the CSP's `script-src 'self'` allows) sets the attribute from
the head of every HTML entry before the stylesheet; `theme.test.ts` holds its key
to `THEME_KEY` and its place in the four files. A switch lands in one frame:
`useTheme` holds every CSS transition off while the new tokens resolve
(`.theme-switching` in `index.css`), so no hover fade starts on every row at
once (record [0211](decisions/0211-theme-switch-renders-nothing.md)).

**Ranked cells.** In dark a ranked cell is the band's colour as its text over
the same colour at 20%, exactly as before. In light that text fails, so the
tint stays and the text is the same hue's Tailwind 800 step, interpolated
between bands the way the tint is (`ink` on each `ColorScale` in `colors.ts`,
read by `cellInks`). `cellStyle` hands a cell both inks at once as
`light-dark()`, so the root's colour scheme picks one and a switch re-renders
no row (record [0211](decisions/0211-theme-switch-renders-nothing.md)). The 700 steps measured 3.8 to 5.0:1,
which is why it is the 800s. `colors.test.ts` pins every band's ink on the light
panel over its tint: the verdict ramp 5.42 to 6.27:1, temperature 5.44 to
7.26:1, the freezing level 5.83 to 8.06:1, and the cloud deck and snowfall as
the reverses of the two they mirror.

**The chart.** `chartColors.ts` draws the lines in ColorBrewer Set1, twenty
shades a theme: Brewer's nine, a lighter shade of each, and a darker shade of
the first two, the set the maintainer chose in the Chart Palette Lab. Dark is
that set as the lab drew it. Light makes the darker shades first and lowers the
eight that fall under 3:1 on the panel, hue and chroma kept, until they clear
it. Nothing in a line's colour wears an edge: not the lines, the dots, the
readout's swatches, the legend's dots or a ticked chart box. The twenty repeat
past the twentieth line, and `LINE_DRAW` holds every line at full strength at
any count, 1.5px up to `CROWDED_PAST`'s thirty and 1px past it, so a crowd
reads as a weave rather than a wall (record
[0228](decisions/0228-chart-lines-set1-twenty.md)). The allocator stores an
index rather than a colour, so a switch recolours every line, swatch and table
checkbox without reallocating which destination has which slot. Every colour
reaches the chart as `light-dark()` (`lineColor` and `CHROME`), so a switch
repaints it without re-rendering it (record
[0211](decisions/0211-theme-switch-renders-nothing.md)). The chrome
follows the tokens: axis `ink-soft`, grid `rule`, surface `panel` and playhead
`accent-ink`.

**What does not change.** The map's ground does not follow the theme: it is
Liberty's light terrain unless the Satellite row puts imagery under it, which is
dark. The basemap, the markers, the ring, the labels and their halo, and every
overlay's fill and edge keep their values in `mapStyles.ts` and the overlay
modules, and the markers, their labels and the scale bar are built to read on
either ground: a marker wears a dark ring outside its white stroke, and the
scale's ends are a dark line and a light one (#799). Record:
[0234](decisions/0234-map-reads-on-a-dark-ground.md) The
map's control buttons and its credit box are the app's chrome and
follow the theme like any floating box, which is why in light their glyphs keep
MapLibre's own dark drawing where `map.css` inverts them in dark, and the credit
line reads in `ink-mid`.

**The popups follow the theme** (#740), **and are the panel's own surface** (#786). Every colour a card wears is a
`--popup-*` value that `map.css` declares once, each the app's `--ui-*` token
for the part it is, and `popupChrome.ts` names them in its markup as
`var(--popup-label)` and the rest. The card is the panel: its surface `panel`,
its header band and grid columns halfway between `panel` and `raised`, its
ranked cell `raised`, its inks the panel's, its warning the table's `warn`,
its link-out glyph the label grey, taking `accent-ink` on hover. The light
theme redefines the tokens, so the light card is the light panel and its
`map.css` block says only the colour scheme. A link in a
card is in the colour of the text around it, the way the results table's are:
a grid number in the ink, the coordinates in the facts line's grey. It
underlines on hover and keyboard focus at a desk, and on a touch screen it
wears a thin underline at rest in the label grey (`[data-popup-link]` in
`map.css`), as the table's links do (`LINK_QUIET`, record [0212](decisions/0212-links-underline-on-hover-and-touch.md)).
A card's one action, Add to analysis, Remove from analysis or ✕ Remove point,
is `BUTTON_ACCENT` itself, worn as its class list: a popup is in the same
document as the panel, and Tailwind emits a class for any name in the source.
`styles.test.ts` fails a `--popup-*` value that is not a token and measures
every pair in both themes; `popupParity.spec.ts` reads the rendered card and
button against the panel's in a browser. Record: [0163](decisions/0163-popups-follow-the-theme.md) Record: [0215](decisions/0215-popup-is-the-panel.md)

## What is enforced

| What | Where | How |
|---|---|---|
| Every text role is unique, and no recipe sets two competing colours | `styles.test.ts` | Uniqueness over `TEXT` and `PROSE`; a resting-colour count over every exported role |
| No component invents a size | `eslint.config.js` | Ban a ramp step or an arbitrary size in a string or template in component sources |
| No component names a hue | `eslint.config.js` | Pattern match on non-slate color utilities, built from alternation so an unlisted one still fails, and on the theme's hue tokens (`accent`, `warn`, `danger-tint` and the rest), which are the same hues in another spelling (#706). Component sources are `App.tsx`, `components/` and `map/`, and the self-test lints one hue at a path in each of the last two to prove the glob reaches them |
| No component sizes a tap target | `eslint.config.js` | Ban `touch:` utilities in component sources |
| No component sizes radio/checkbox | `eslint.config.js` | Covered by the hue ban, which reaches `accent-*` |
| No component re-widths a segment | `checks/styles.js` | `style-call-site-classes`: a `w-*` in the template that composes `SEGMENT` |
| No component sets the panel's text ink | `eslint.config.js` | The ink tokens below `ink-strong` are the surface system's, already covered by `TEXT`, `SURFACE_*` and `FIELD` |
| No component spells a slate, white or black step | `eslint.config.js` | Each paints the dark value in both themes, so it is the one spelling that cannot follow the switch; take the role, or the token it reads (#706) |
| No component restates a shared recipe | `eslint.config.js` | Ban the three class lists a role already composes |
| The panel sizes by pointer, not by viewport | `eslint.config.js` | Ban a breakpoint variant on padding, gap or height in `ControlPanel.tsx` and the section files it renders (`PANEL_FILES`) |
| A panel heading takes a role | `eslint.config.js` | Ban a quoted class list on an `h1`-`h3` in the same files |
| The map's edges are one inset | `checks/styles.js`, `styles.test.ts` | `style-map-chrome` bans a top or left inset at the map's chrome in `App.tsx` and the four map components (`MapLegend`, `LayersPopover`, `MapRows`, `AnalysisOverlay`); the test does the same for `map.css`, which ESLint does not read |
| No component dims a placeholder | `eslint.config.js` | Ban placeholder utilities below AA contrast |
| Every radio/checkbox uses the shared recipe | `styles.test.ts`, `checks/styles.js` | The test checks `CHOICE_INPUT` composition and counts one per `CHOICE_ROW` in each panel file; `style-call-site-classes` bans a size after `ACCENT.input` |
| Every focus-able control has focus ring | `styles.test.ts` | List per control type |
| Segmented controls are built one way | `styles.test.ts` | Check `SEGMENT` / `SEGMENT_IDLE` / `SEGMENT_ITEM` composition |
| Metric names are centralized | `eslint.config.js` | Ban the six abbreviations in strings and templates across twelve consumer files |
| Precipitation precision is centralized | `metrics.test.ts` | Ban a `toFixed` on a precipitation value in the same twelve files, read as text; `formatPrecipTotal` / `formatPrecipRate` decide |
| Tooltips match the approved list, count for count | `styles.test.ts` | `title=` occurrences per component file |
| No unsafe error message patterns | `checks/data.js` | `open-meteo-copy` bans `failed: ${...}` and the retired phrases; `open-meteo-throw-tail` holds every thrown Open-Meteo message to the standing tail |
| Every full page stands on one ground | `checks/styles.js` | No component or `App.tsx` spells the bare page fill, and `App.tsx`, `PageShell.tsx` and `ErrorBoundary.tsx` each wear `SURFACE_PAGE` |
| Every radius is on the scale | `styles.test.ts` | Any `rounded*` in a component source must be a `RADIUS` value |
| Every message is in the one list the Analyze button opens | `checks/styles.js` | A notice is a `NOTICE` role, only `MessageList`'s `MessageBox` wears one and the list stands on the one menu (`style-message-list`, `style-notice-once`); the one live region is `MessageRegion` beside the badge (`style-live-region`, `style-panel-no-status`); both Analyze buttons wear the badge, the region and the list, and a blocker greys the button with `aria-disabled` rather than `disabled` (`style-analyze-badge`); the polygon block is the one bare `STATUS` use outside the list, pinned by count: two in `DestinationsSection.tsx` and the point count's four in `DrawReadout.tsx` (`style-draw-counter`, `style-draw-readout`), which the panel and the phone's draw bar both render |
| A disabled control's reason has a hidden twin | `checks/accessibility.js` | Every `aria-describedby` in `LayersPopover.tsx`, `ResultsTableHeader.tsx`, `ResultsTableRow.tsx`, `ForecastCalendar.tsx`, `MapLegend.tsx` and `ColumnsPicker.tsx` matches a `SR_ONLY` element |
| A metric cell link is named by its value | `checks/accessibility.js` | `new-tab-anchors-named` fails an `aria-label` on the anchor built from `windyCellUrl`, and requires its `aria-describedby` and the Windy sentence |
| The Layers rows are alphabetical | `styles.test.ts` | The five row labels equal their own sorted order |
| The legend is one box, sorted by what it reads | `styles.test.ts` | One `SURFACE_CHIP_CARD.key` in the block, every section built by `legendSection`, and the list sorted on `label.localeCompare` — the metric key included, so a `Temperature` ranking sorts last and an `AQI` one first |
| A tick on a strip clears AA | `styles.test.ts` | `RAMP_INK` pins three measurements: white and slate-900 straight onto the ramps, which both fail, and slate-200 on the scrim, which is the one that passes |
| The chip menus are one width and hang one way | `styles.test.ts`, `checks/styles.js` | `MAP_MENU_W` inside `MAP_CHIP_MENU`, worn once by each menu; `style-map-chrome` fails a width, offset or chip height spelled beside the roles |
| The map's rows, a phone's sheets and its Analyze button are built from one sum, and every target is 32 on a finger, 44 around the chips | `styles.test.ts` | `MAP_ROWS`' 92px and every anchor under it, the chips', pill's and locate button's hit areas, `MAP_FAB`'s 56px and reserved width, `BOTTOM_SHEET`'s 32px rows, the chips at the control size, the message badge's 20px disc and its 44px to a finger, `SAFE_AREA` under every sheet, `CONTROLS_SHEET` and the sticky Name column |
| The control column is derived, not chosen | `styles.test.ts` | `CONTROL_W` equals two `METRIC_BOX_W` plus the grid gap; the picker, chart-select, metric-label and segment-half budgets are summed from measured words |
| No bottom offset is spelled in a component | `checks/app.js` | Ban `bottom-*` in `App.tsx`, `MapLegend.tsx` and `TimelineTransport.tsx`, and `justify-end` / auto margins on the legend card |
| The accent ratios are pinned | `styles.test.ts` | 4.56, 3.20, 3.04, 3.91 and the 4.02 hover are literals a change must re-measure, and in light 4.56, 4.06, 3.54, 3.17, 4.56 and the 6.45 hover |
| Every light value is measured where it lands | `styles.test.ts`, `colors.test.ts`, `chartColors.test.ts` | The test parses both token blocks out of `index.css`, reads each dark token back to the slate or sky step it always was, and pins the light theme's ratios role by role (see The light theme below); the cell inks and chart lines per theme |
| The theme is the switch's, never the operating system's | `checks/styles.js`, `styles.test.ts` | `style-no-os-theme` bans a `dark:` variant and `prefers-color-scheme` in any string or template under `src/`, tests aside, because either paints by the system's setting under a switch that may say the opposite; the test holds `index.css` and `map.css` to the same, since ESLint does not read CSS (#706) |
| A stored light theme paints before React does | `theme.test.ts` | `public/theme.js` reads `THEME_KEY`, stays under 400 bytes, and is in the head of all four HTML entries before the module script, with no inline script anywhere |
| No component draws its own glyph | `checks/styles.js` | Ban a literal SVG opening tag everywhere under `components/` and `map/` and in `App.tsx`, except `icons.tsx` |
| Nor does the map popup | `checks/styles.js`, `styles.test.ts` | `style-popup-glyph` bans the same tag in `utils/popup/popupChrome.ts`, which builds markup rather than elements; the test pins its glyph size to the `inline` step |
| No call site sizes an icon | `checks/styles.js`, `styles.test.ts` | `style-call-site-classes` bans a height or width utility on any `<Icon…>` element; the test pins the four `ICON` steps by measured pixels, and the key set too |
| Every glyph is hidden from assistive technology | `checks/accessibility.js` | Every SVG in `icons.tsx` and `iconPaths.ts` carries `aria-hidden` |
| No component positions its own menu | `checks/styles.js` | `style-own-menu` bans a fixed-position style object and the menu card everywhere under `components/` and `map/` and in `App.tsx`, except `Menu.tsx`; `style-menu-shell` holds `Menu.tsx` to the card, the portal, the trigger role and the one chevron |
| One place decides where a panel goes | `checks/styles.js` | `popoverBox` has exactly one caller, the `usePopover` hook |
| Every desk menu is the one menu | `checks/styles.js`, `styles.test.ts` | `style-one-menu` fails a `placement` handed to `usePopover`, a `role="listbox"` outside the card `Menu.tsx` draws (`SearchBox.tsx` aside), and a native `<select>` outside a phone's branch; `style-no-unfurl` fails the old join's roles, its attribute and its placements anywhere the app ships; `style-menu-trigger` fails a plain button with `aria-expanded` where a `MenuButton` belongs; `style-menu-field` and the chip and results bar checks require each trigger's shape; the test pins the 4px gap, the 10px inset, the three shapes, the chevrons and the motion |
| No component spells the third divider weight | `styles.test.ts` | Ban the slate-700 border utility, and since #706 the `rule` token's, everywhere under `components/` and `map/` and in `App.tsx`, and check every `SURFACE_DIVIDER` use carries a side |
| No component fades by a number of its own | `styles.test.ts` | Ban any `opacity-` utility everywhere under `components/` and `map/` and in `App.tsx`; `DISABLED`, `MUTED` and `DRAG.carried` are the three fades |
| Nothing pressed reads at the micro step | `checks/styles.js` | `style-micro-not-pressed` bans `TEXT.micro` in the class of any `button` or `a` in the app's sources; `styles.test.ts` holds `MICRO_SIZE` at 11px and `GLYPH_SIZE` to the two swatch roles |
| Every shadow is a step of one scale | `styles.test.ts` | Every surface role's shadow is an `ELEVATION` value, the sheet and the banner wear `none`, and no component spells a `shadow-` utility |
| Every exported role is rendered by something | `styles.test.ts` | Each `export const` in `styles.ts` appears in some non-test file's import list under `src/`, or in a `TEST_ONLY` list that carries its reason and is itself checked for a real importer |
| No call site names a colour value | `checks/styles.js` | `value-hex` bans a hex triplet, sextet or colour function (`rgb()`, `hsl()`, `oklch()` and the rest) in any string or template under `src/`, tests aside, outside the modules that own a colour (`styles.ts`, `colors.ts`, `chartColors.ts`, `resultFeatures.ts`, `map/mapStyles.ts`, `map/basemap.ts`, `map/terrain.ts`, the four overlay modules, `radar.ts`, `iconPaths.ts`, `logo.ts`). This is the hue ban's reach into the four channels a Tailwind class never touches: MapLibre paint, canvas drawing, popup HTML and Recharts props (#365) |
| No popup spells its own type size, padding, radius or background | `checks/styles.js` | `value-inline-style` bans `font-size:`, `padding:`, `border-radius:` and `background:` in any string or template under `src/`, tests aside, outside `popupChrome.ts`, which owns the popup's three sizes, its button and its rule |
| The app's own layers read their paint from one module | `checks/styles.js` | `map-paint-named` bans a numeric literal under a `circle-`, `line-`, `fill-`, `text-` or `icon-` key in `map/*.ts` outside `mapStyles.ts`, `basemap.ts` and `terrain.ts`; the result and pending markers and the ring's handles spread one recipe each |

**NOT enforced:** custom spacing between components (only recessed surface and controls are architected), component-specific layouts, and the numbers inside an overlay's own paint (a fire outline's width, a smoke fill's opacity), which each overlay's pure module owns beside its popup and its legend swatch. These are decided per feature.

### The four channels the stylesheet never sees

Every rule in the table reads a Tailwind class or a React element, except the
last three, and a Tailwind class is not the only way pixels reach the screen.
Four channels bypass the stylesheet, and each has one module that owns its
values (#365):

| Channel | Owner | What it holds |
|---|---|---|
| MapLibre `paint` and `layout` | `map/mapStyles.ts` for the app's own objects (markers, labels, the ring and its handles, the camera's durations and padding); `map/basemap.ts` for the terrain-matched label and trail colours; `map/terrain.ts` for the shaded relief's shadow and light and the contours' ink and labels (#799), one value for both themes because the map stays light in both; each overlay's pure module (`utils/wildfires.ts`, `utils/smoke.ts`, `utils/closures.ts`, `utils/snowDepth.ts`) for its fill, edge and legend swatch | Hex values named for the Tailwind step they match, because the GL renderer takes a string and not a class |
| Canvas 2D | `map/mapStyles.ts` (the wind arrow's two inks); `map/basemap.ts` (the POI glow) | The same |
| Popup HTML handed to `setHTML` | `utils/popup/popupChrome.ts` | The three type sizes, the face, the names of the card's colours (each a `--popup-*` value, an app token in `map.css`, record 0215), the one button (`BUTTON_ACCENT` as its class list), the card every popup wears (`popupCard`: its header band, notices, body and action), and the marker popup's grid cells (bands, gutter, hairlines, the ranked cell's darker slate, and the compact insets a narrow map takes); its scroll cap's bar is `.popup-scroll` and a card's frame and close-button lane `.popup-card`, both in `map.css`. The `style-popup-card` check fails a popup builder that does not return the card (#738) |
| Recharts props | `utils/chart/chartColors.ts` | The axis, grid and playhead colours beside the line palette |

A colour in one of those channels is measured against the surface it actually
lands on, which for a popup is the card's own surface in each theme rather
than the panel; `popupChrome.ts` records each light measurement beside its
value, including the ones that sit under AA as shipped (`FINE_COLOR`,
`WARNING_COLOR`), which #365 named without recolouring. On the dark card the
warning clears AA and the fine print still does not, by the same step back.
A third, the overlays' sky-400 link, left with the overlays' own shell in
#738.

### Two enforcers, split by what they know

`eslint.config.js` (in `frontend/tools/eslint/`, for the TypeScript-version
reason recorded there) carries the **syntactic** rules: the ones a pattern over
class names, string literals or the syntax tree can answer on its own. The
class bans live in the config itself; the per-file checks, which say what one
named file must or must not contain, live under `frontend/tools/eslint/checks/`
(`checks/styles.js` for the design system). `styles.test.ts` carries the
**measured** ones: a contrast ratio, a pixel sum, a width read off a role, a
count of approved tooltips, and any comparison between a source and a value the
role modules export. Nothing was dropped in either move (issues #379 and #408);
the rules read string literals, template chunks and nodes rather than a file's
bytes, so a class name written in a COMMENT is prose about the rule instead of
a violation of it, and a violation is underlined in the editor rather than
reported by `npm test`.

`npm run lint` in `frontend/` runs it, then runs the rules against
`frontend/tools/eslint/fixtures/`: one file per class ban, each of which must
report its own ban and no other, plus one file carrying `Precipitation`,
`Minimum` and `Maximum` that must report nothing; and, under
`fixtures/checks/`, one or more files per check that together must report every
message the check carries. A selector that matches nothing reports nothing,
which reads exactly like a clean tree; the self-test is what tells the two
apart. `docs/DEVELOPMENT.md` lists every check that is still a text test and
why. CI runs the same script in the `Frontend Typecheck & Tests` job.

## Measured numbers

### The accent fill custom shade

The accent fill answers four measured constraints at once and must pass WCAG AA on each. On a white-on-blue design, those constraints are tight.

- `--color-sky-650` is defined in `frontend/src/index.css` and used throughout as the custom token
- White on `sky-650` measures **4.56:1** against 4.5:1 WCAG 1.4.3 (text contrast)
- Against the slate-800 panel it reads **3.20:1** against 3:1 WCAG 1.4.11 (UI boundary)
- On `DAY.range` (sky-950 background) it measures **3.04:1** (the binding edge)
- On the segment track it measures **3.91:1**
- The hover state (`sky-600`, white label) is **4.02:1** — deliberate exception, documented below

**Why this shade?** No Tailwind scale step fits. The surviving window for both constraints is 0.0067 of relative luminance wide, and `sky-650` is the midpoint: sky-600 sits above it (white reads 4.02:1) and sky-700 below it (the fill drops to 2.37:1 on the range band, so the ends of a selected range sink into it). Two roads not taken: dark labels clear both constraints with far more room (rejected for brand reasons), and documenting 4.02:1 as a conformance exception was considered (rejected: 4.02 is below AA, and the resting state is the one a reader looks at, so the custom shade lifts it to 4.56 and leaves only the hover short). The hover at 4.02:1 is kept because with a white label every lightening costs contrast — a conformant hover would have to darken, making the app's primary action the only control that dims on pointer-over.

**Re-measure condition:** if `DAY.range` ever changes, re-derive this shade. The binding edge is `DAY.range` at 3.04:1, so the selected day must still be findable against the range band beside it.

### The light theme

The light accent is the dark theme's own sky-650, so the accent is one colour
in both themes. The theme first shipped `#00639b`, the Material primary, which
the maintainer found too dark on Analyze, the segments, the calendar's ends and
the checkboxes (PR #733). On the light grounds sky-650 has more room than it
has on the dark ones, and its hover darkens to `#00639b` rather than
lightening, which with a white label is the direction that gains contrast, so
no light accent state is under AA. The accent as text does not follow: sky-650
reads 4.06:1 on the light panel, under the 4.5 text owes, so links,
`ACCENT.text` and the focus ring keep `#00639b`. Measured 2026-10-15 in
`styles.test.ts`, against the token values it parses out of `index.css`:

| What | On | Light | Dark, for comparison |
|---|---|---|---|
| White label on the accent fill | the fill | **4.56:1** | 4.56 |
| The fill | the panel | **4.06:1** | 3.20 |
| The fill | `DAY.range` | **3.54:1** | 3.04 |
| The fill | the segment track | **4.56:1** | 3.91 |
| The fill | `DAY.range`'s hover | **3.17:1** | |
| White label on the hover | `#00639b` | **6.45:1** | 4.02 |

The 4.56 is taken on the hex the browser paints rather than on the oklch
value, in both themes, and it is every label on the fill: a button's, a lit map
chip's and its glyph, and the welcome dialog's step badge.

The rest of the theme, role by role, each pinned as a literal:

- **Text.** The lowest any text role reads on any surface it lands on is the
  soft ink on the raised fill, 7.47:1. The placeholder reads 9.36:1 on the
  well, the micro step 12.3, 10.31 and 11.51 on the floating, raised and panel
  fills, and the lifted caption 9.19 on a highlighted search result.
- **Icons and boundaries (3:1).** The faint ink, which an icon at rest wears,
  4.32, 3.87 and 4.85 on the panel, raised fill and well. The structural edge
  3.97 on the panel and 4.46 on the well, and 4.24 on the floating fill; the
  lifted edge 3.56 on the raised fill. The accent mark 4.06, 3.64 and 4.56 on
  the panel, raised fill and well, and the focus ring 5.14 to 6.45 on all four
  grounds. The adornment glyph 9.36.
- **Lines meant to be quiet.** The rule 1.50:1 on the panel (dark's is 1.41)
  and the outline 2.35, which is exactly halfway between the rule and the
  edge in RGB, the derivation the palette asked for.
- **Notices.** Each ink on its own tint and on the panel: warn 5.85 and 6.31,
  error 7.24 and 8.33, info 7.44 and 8.35. Each box's rule is its ink at 38%
  over its tint. The warning ink is amber-800 (`#973c00`) rather than the
  palette's `#6b4600`, a brown that did not read as a warning beside dark's
  amber (PR #733); it reads 5.66:1 or better on every surface a warning stands
  on, and its dismiss glyph 5.33 on the pill. `STATUS.ok` reads 5.84 on the panel, and the danger button's
  label 7.72 on its fill and 6.59 on the hover.
- **The message badge.** Its digit is the panel's colour on the worst
  message's ink, so each pair above read the other way round: in light the
  error fill 8.33, warn 6.31, info 8.35; in dark error 5.06, warn 10.1, info
  8.77. `styles.test.ts` pins all six.
- **Fades.** `MUTED` at 65%: 5.07, 5.34 and 5.10 on the three places a muted
  label stands (60% left 4.31, 4.50 and 4.38).
- **Decoration.** `DAY.unservable` reads 2.45:1 on the well, as the dark
  theme's does under 3: a day nothing can be served for is not a control.
- **The legend strip's numbers** read 15.12 and 9.79 on the strip's lightest and darkest
  bands under the light scrim, where dark's read 6.48.
- **The slider thumb** is the ink rather than white, because a white thumb
  would vanish on the white well; it reads 3.75:1 on the mark beside the
  dark white thumb's 2.71 on its own.
- **The scroll shade** is the ink at 12%, 1.27:1 off the light panel, where
  dark's slate-950 at 70% stands 1.29:1 off its own.
- **Chart lines** read 3.01 to 7.21:1 on the light panel, every one of the
  twenty at or over 3:1, and 2.13 to 13.48 on slate-800, where four stand
  under 3:1 (the two darkest shades, purple and brown), which the maintainer
  accepted with Tableau's lead (#801). The axis reads 8.34 in light and 5.56
  in dark.

**Re-measure condition:** every one of these numbers is a literal in
`styles.test.ts`, `colors.test.ts` or `chartColors.test.ts`, so changing a
light token fails the suite until the number is taken again.
Record: [0158](decisions/0158-light-theme-behind-semantic-tokens.md)

### The type floor

`MICRO_SIZE` is 11px, and that is the floor for text a reader reads (#687). It
was 10px, which read as a smudge on the calendar's weekday row and under the
player, and the audit found 10px at nine places with no rule about where it
could go. 12px (`TEXT.control`) is the floor for anything pressed, so no button
or link wears the micro step; the linter's `style-micro-not-pressed` check is
what enforces it. The Restore buttons in the Removed list were the one press at
10px and read at `CONTROL_SIZE` now. A credit is the one link that keeps the
step, because a credit is the step's own job: MapLibre's attribution line on the
map, which carries the Open-Meteo credit since #687.

One size stays under the floor, `GLYPH_SIZE` at 10px, private to `styles.ts`: a
glyph inside a box whose size something else decides, the legend strip's
numerals in their scrim band and the smoke key's letters in their chips, which
grew to 16px squares to take them. Neither is prose, and each is measured
against its box. The map's scale bar is at the floor: its label sits in a
bar whose width the distance decides, so the bar draws up to 110px rather
than the library's 100, and `1000 km` at 11px fits its narrowest bar (record
[0222](decisions/0222-one-card-one-close-one-type-ramp.md)).

Re-measured at 11px, 2026-10-13 against the built image: the calendar's weekday
row, the player's marks, the model picker's reach column (no option overflows),
and the chart's ticks, which take the step as `CHART_TICK_PX` and still fit the
44px `Y_AXIS_WIDTH`. `PROSE.title` moved to `TEXT.appTitle`'s 18px at the same
time, so a dialog heading and the panel's name are one size.
Record: [0131](decisions/0131-type-scale-floor-and-elevation-scale.md)

### The elevation scale

Every shadow is one of three steps of `ELEVATION` (#687). The audit found five
shadow sizes on eight surfaces with nothing deciding which got which.

| Step | Utility | What wears it |
|---|---|---|
| `none` | `shadow-none` | What stands on an edge rather than floating: the phone's results sheet, the preview banner, the sliders' thumbs |
| `raised` | `shadow-lg` | What rests on the map and is read past: the search pill, the chips, the legend card, the player, the chart tooltip, the phone's draw bar |
| `overlay` | `shadow-2xl` | What opens above other chrome and is closed again: every menu (`SURFACE_CHIP_CARD.menu`), every card over a scrim (`SURFACE_CARD`), and a column being carried (`DRAG.ghost`) |

`2xl` rather than `xl` for the top step, measured on the search list: its
single 0.25-alpha blur is the one of the two that still reads over the dark
results sheet. The glows are not on the scale, `ACCENT_RING` and the tutorial's
spotlight, because they point at something rather than lift it.
Record: [0131](decisions/0131-type-scale-floor-and-elevation-scale.md)

### The three weights of rule

Measured against the slate-800 panel and card, which is what every one of them
is drawn on except the calendar's ground in its popover:

| Role | Colour | Contrast | Who places it |
|---|---|---|---|
| `PANEL_EDGE` | slate-500 | 3.07:1 | The call site |
| `PANEL_RULE` | slate-700 | 1.41:1 | The panel's stack |
| `SURFACE_DIVIDER` | slate-700 | 1.41:1 | The call site |

Only the first is meant to be seen as a boundary, and it is the one step that
clears the 3:1 a UI boundary owes. It closes the panel on three sides: under the
header, over the footer, and since #697 down the panel's right edge, where it
meets the map and the docked results. Since #795 the docked results bar wears it
along its top, where the results meet the map, so the map's column is edged the
same way on both sides, which the light theme's pale bar needs, and no rule at
its foot, where the grip under it draws one (record 0220). That edge was `SURFACE_DIVIDER` at 1.41:1,
which left the panel and the slate-800 results one L-shaped block; `PANEL_EDGE`
is 3.07:1 there and 3.74:1 on slate-900. An 8px slate-900 gutter was mocked
beside it and declined (record 0128). The other two are the same quiet line, and
since #687 the same colour: `PANEL_RULE` was slate-600 at half opacity, which
composited to (50.5, 63, 82) on the panel where slate-700 is (51, 65, 85), a
second spelling of one line that nothing but the arithmetic held together.
`styles.test.ts` now holds the two to one colour. They stay two roles because
they differ in who decides WHERE the line goes, not in what it looks like:
`PANEL_RULE` is a whole recipe with its own margins and padding, drawn from the
stack so a section added later cannot forget its line, and `SURFACE_DIVIDER` is
a bare colour for the surfaces that place one rule themselves.

`SURFACE_DIVIDER` was the literal `border-slate-700` at eleven call sites in
eight files before #390 named it. The results table's rows are the one place
that still takes it at half opacity, inside `TABLE.row`: a rule drawn once
between two blocks of a card is a line, and the same rule drawn twenty times
down a screen is a grid.

### Copy length budget

The panel is 360px on desktop (100vw − 2rem capped at 360 on phones).

- Boxed status messages: ~47 characters per line (floor of 360px minus padding and margins)
- Assumption: English; other languages will be tighter

**Binding condition:** a 360px phone with English copy. If copy reaches ~47 chars without wrapping, it fits one line. Nothing pins the ~47 in a test; the number that is pinned is the 281px column against the 267.3px cue below.

**No indent:** the messages in the list the Analyze button opens are stacked rows
separated by a 1px rule (`NOTICE_DIVIDER`), never a bulleted list. The
budget above is measured with the whole text column, and a list indent
plus its marker take 16px of it — enough to wrap a line that fit on its
own before a second message joined it.

**The dismiss X costs the column 20px, not 44:** on a coarse pointer the
target is 44px wide and the glyph's box is 20, and the difference reaches back over
the tail of the text (`touch:-ml-6` on `NOTICE_DISMISS.button`) rather
than out of the column. Nothing moves on screen. Measured at 402px with
the panel at 360: the column is 281px, where the longest commit cue
("A new destination type requires a new analysis.") needs 267.3px.
It costs the row no height either: negative block margins hand back
everything past the 16px line (`-my-0.5` round the glyph on a mouse,
`touch:-my-2` round the 32px target on touch), so a box with an X stands as
tall as a blocker's box without one, and the target overhangs its row
instead (the maintainer, 2026-10-21 on PR #789).

**Line allowance:** messages in the panel body hold to one line. The list
the Analyze button opens — blockers, commit cues, refusals, provider
errors, and the warnings that qualify a report — may run to two lines,
because that is where the app explains why it will not or could not act
and a truncated reason is worse than a second line.

### Results bar fold point

The results bar is one line when its container is 896px or wider, and two lines below that: the title row (ranking summary, window, collapse chevron) and the actions row (mode switch, Columns, Models, Removed, Download CSV). The actions row is two groups (#687, the maintainer on #709): the mode switch, and the buttons right-justified against the bar's right edge, at least 16px apart on the folded line (`gap-x-4`, which the 19px a 360px phone leaves between the two glyph groups can hold) and 24px on one line (`gap-x-6`). The bar's words show only where both groups fit on one line labelled, `BAR_LABEL`'s 584px of content, measured 2026-10-13: the labelled switch is 176.7px, the labelled group with `Removed (1)` 377.8px, the gap 16px, and two more digits of a Removed count 13.4px. Beside the docked panel at 1024 wide the bar has 640px and keeps its words, chevrons included: at a desk the three menu buttons carry them, the labelled group is 437.8px (measured 2026-10-20), and a two-digit Removed count still fits the line, where a three-digit one wraps the group onto a line of its own; every phone from 360 to 430 wide shows the switch and the glyphs on one line, Removed or not, and the sheet's header is 84px in every one of those states, which is `SHEET_HEADER_PX` in `frontend/src/utils/results/resultsSheet.ts`. Re-measure both together. At 1024x768 beside the docked panel the bar is 59px, two lines, and at 1440x900 35px, one line, the same as before the buttons.

The four actions are one `ACTION_GROUP` of `ACTION_ITEM` buttons, the mode switch's sibling in look and height, each a glyph and a word (#687). They were underlined links, so the one bar carried four control styles; the linter's `style-results-bar` check now requires the four items, the one group and `BAR_LABEL` on all seven words, and fails a link anywhere in the bar. The Open-Meteo credit that stood at the end of the row is on the map's attribution line at the bottom right, beside MapLibre's and the basemap's credits, where a credit reads as one rather than as a fifth action, and where it stands in every results mode. Record: [0133](decisions/0133-results-bar-buttons-and-footnote-credit.md)

The mode switch wears `SEGMENT_FLUID`, not `SEGMENT`: the panel's segment role bakes in the sidebar's column, which three icon-plus-label halves cannot fit — that mismatch is how the switch once shipped clipped by its own `overflow-hidden`.

### Map chrome

The map carries two rows across its top at both widths, and a phone's map one
button at its foot as well
(`MAP_ROWS`, `MAP_PILL`, `MAP_ROUND_BUTTON`, `MAP_CHIP`, `MAP_FAB` in `styles.ts`).
The rows are four numbers, the map's 12px inset, the 40px first row, 8px
between and the 32px chip row, so they end 92px down; the draw bar, the
compass, the bottom sheet's card and the results sheet's highest stop are all
built from that sum, and
`styles.test.ts` holds each to it. The chips are 12px type with 12px a side,
the search pill's size (record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)),
content-sized, and only the summary may shrink, by an ellipsis on its words.

At a desk the pill stands alone on the first row, 320px wide, and the rows
are as wide as the wider of it and the chip row, so the rest of the map's top
is the map's. The map's buttons stand in its bottom-right corner instead, as
Google Maps stands its own (`MAP_CORNER`): the credit line flush in the corner
with the scale at its end, and over it the compass, the locate button and the
zoom pair, 24px in, 6px apart and 10px above the line. The line sets the
library's 20px line (`leading-5`), which its controls lose outside the map's
container, so the scale keeps its 22px box and the line is 27px tall
(measured 2026-10-21, `e2e/deskCorner.spec.ts`). The zoom pair is one
capsule (`MAP_ZOOM_PAIR`), whose halves take the raised fill under the pointer
rather than the sky edge, since the rule between them is the lower half's edge
alone. The chip row holds Legend and then Layers at both
widths, so the legend card, open by default, hangs over the map's left edge,
with the summary chip at the row's front only while the panel is shut. Their menus open as whole cards 4px under
the chip (`MAP_CHIP_MENU`), each chip carrying a chevron that points down while
its card is shut and up while it is open (`MENU_CHEVRON.chip`). A phone's chips
carry none, because a sheet rises from below. The two cards wear one surface,
the chips' colour made opaque, with the structural edge (`SURFACE_CHIP_CARD`), so the Layers
menu reads as the legend card's twin and its outline and deeper shadow part it
from the legend where it opens across it. The legend card scrolls inside the map's height under
the rows, read off the wrapper as `100cqh` (`legendMaxCss`). Analyze stays in
the panel. A phone draws no zoom pair, since a pinch zooms there.
Record: [0174](decisions/0174-desk-map-rows.md)

Seen and pressed are two sizes. On a coarse pointer a chip is 32px seen and
44 pressed, by a pseudo-element 7px above and below it measured from inside
its 1px border; the locate button 40 seen and 44 pressed, by a 3px rim
`map.css` puts on the library's button; the pill 40 seen with its field 44
pressed (`MAP_PILL_FIELD`). Each is the role's, never a `touch:` utility at a
call site.

Analyze is Material's extended floating action button: 56px tall, 16px off
the right edge and off whatever it stands on, a 16px corner, the call to
action's type on `BUTTON_PRIMARY`'s fill. Its three words (`Analyze`,
`Analyzing…`, `Try again`; record 0169) stand in one grid cell, so it is as
wide as the widest. Measured 2026-10-14 in the Playwright
image's Chromium at 360, 390 and 430 wide: the summary chip 169.4px, Layers
65.0 and Legend 69.4, 315.8 with the gaps, which leaves 20.2, 50.2 and 90.2px
of the row empty; the button 120.1px, `Analyze` 52.9 and `Analyzing…` 80.1.
The mockup measured the same three at 289px in Chrome on a Mac, whose system
face is narrower. Re-measure when a chip or a model label grows. A press
shows by `MAP_FAB_PRESSED`, Material's pressed state: a state layer of the
label's white at 12% and the shadow a step lower while held, on either
pointer, and never a grey after a run.
Record: [0135](decisions/0135-phone-opens-on-the-map.md)

A phone chart's metric picker is the plot's title (`CHART_TITLE`): the
metric's label with its unit in the app's own select, sized to its words and
28px tall. It wears `FIELD_LOOK`, the fill, edge, radius and type `FIELD` is
built from, with `SELECT`'s `pr-6` and the chevron in `ICON_ADORNMENT`'s
place, so it is the desktop picker shrunk rather than a look of its own. The
native select is laid over it, transparent, 44px tall under a finger. The
plot's top margin grows by the title's 28px (`TITLED_PLOT_MARGIN`), so its
dashed lines, their labels and the top tick start under it. Measured
2026-10-14: the field row it replaced was 52px, and the plotting band grew
24px at 360 and 390.
Record: [0149](decisions/0149-phone-chart-picker-is-the-title.md)

Every button the map library draws wears `MAP_ROUND_BUTTON`, at both widths:
the compass and the locate button, 40px round in the pill's chrome, handed to
each by `map/controls.ts` because the library makes the markup, and a desk's
zoom pair the same chrome joined (`MAP_ZOOM_PAIR`). A desk stands them in its
corner (`MAP_CORNER`). A phone stands the locate button and the compass in
slots at the rows' right ends (`MAP_SLOT`) and leaves its zoom pair hidden in
the library's corner. While the map is north-up and flat the compass is
disabled: greyed by `DISABLED` at a desk, so the column keeps one shape, and
hidden in a phone's chip row. The 3D button (#799) is the one map button the
app draws itself, as a library control so it stands with the rest: the same
round chrome with the word `3D` at the control size in bold
(`MAP_TERRAIN_BUTTON`), under the compass at a desk and left of the locate
button in a phone's search row, which gives up one more button and its gap
for it. While it is on,
`map.css` fills it with the accent and its label with `--ui-on-fill`, keyed on
`aria-pressed`, which is the accent fill `ACCENT.fill` paints (white 4.56:1 in
both themes). The credit line's (i) is the same dark
round button at the library's 24px (`MAP_CREDIT.button`) and the opened line
is the floating card (`MAP_CREDIT.card`), which a desk's credit line in the
corner is itself, so the line sheds the card it would otherwise wear; its links dressed in `map.css` as
`LINK` dresses the app's. The compass needle is redrawn rather than inverted,
red-500 north and slate-50 south edged in slate-600, and the (i)'s glyph is
centred on its button's whole box. The scale bar is a ruler on the map, not a
control, so it wears none of that chrome.
Record: [0147](decisions/0147-map-buttons-wear-the-app-chrome.md) It stands on
the legend ramp's scrim in the ramp's ink instead, so it follows the theme
(5.35:1 over a white map in the dark theme, its worst). Its ends are two
lines, dark outside and light inside in both themes, because the map under it
is Liberty's light ground or the satellite imagery's forest and snow: the dark
line clears 14.41:1 or better on snow and on Liberty, the light one 7.72:1 or
better on a forest, and the two stand 14.46:1 apart (record
[0234](decisions/0234-map-reads-on-a-dark-ground.md)). In a desk's credit line
it stands on the line instead, so there it takes no scrim and draws its ends
in one line of its ink (record 0174). Its label is 11px, the floor, on a bar that draws up
to 110px so `1000 km` stays inside its narrowest bar (`e2e/scaleBar.spec.ts`,
record [0222](decisions/0222-one-card-one-close-one-type-ramp.md)).
Record: [0162](decisions/0162-scale-bar-on-the-theme-ground.md)

The Analyze button counts the panel's messages in a badge at its corner
(`MESSAGE_BADGE`): a 20px disc in the worst message's ink with the digit in
the panel's colour, edged in the panel so the button is the 24px a target
owes, 44px to a finger through an inset
nothing draws. A press on it, or on the button itself while a blocker greys
it (`BLOCKED`), opens the messages as a sheet headed Messages
(`MESSAGE_LIST.sheet`); at a desk the same badge on the panel's button opens
them as a card on the one menu (`MESSAGE_LIST.card`). The button stands 16px
over the results sheet's edge, and the scale and the (i) on its row, each
with its bottom on the button's bottom edge, the opened credit line growing
up from that edge. The band that held the whole block on the sheet's edge
(record 0140) is gone, since on a finger it showed one message and no sign of
the rest.
Record: [0208](decisions/0208-analyze-button-counts-the-messages.md)

The summary chip raises the panel as the Controls sheet (`CONTROLS_SHEET`),
the bottom sheet the menus below are, kept mounted: modal over the same dim,
slid below the map while shut, its height a fixed share of the map that
leaves the rows, the button's strip and the 76px the notice band had above it
(`CONTROLS_MAP_PX`, kept at 256 so the sheet opens where it did). Its dim
stands one layer under its card (`scrim` on `LAYER.scrim`). It pushes nothing.
The button, the scale and the (i) stay where they stood under the dim, as
under every phone sheet. Measured 2026-10-21 at 360x740 and 390x844: the
sheet's top at 256, and the button at 390 to 446 and 444 to 500, where it
stood with the sheet shut. The chip is lit while the sheet is up, its words
white on the accent fill. The sheet carries no messages, no count and no fixed
foot: the document links are the last thing in its scrolling body.
Record: [0207](decisions/0207-phone-controls-sheet-is-modal.md)

A phone's home indicator band (`SAFE_AREA`) is padded under the results sheet,
and the chrome placed in pixels stands on its top edge before there is a
sheet. A sheet that scrolls takes the band as padding at its scroller's end,
after its own rhythm (`BOTTOM_SHEET.body`, `CONTROLS_SHEET.body`), so its
content runs to the screen's edge and its last row clears the band once
scrolled to. Where no band is reported the space under the last line is the
space above the rule before it: 16px in Controls, the row's own in a menu
sheet. 0 on a desk.
Record: [0145](decisions/0145-safe-area-bottom.md), [0152](decisions/0152-sheets-end-above-the-home-indicator.md)

The results table's Name column sticks at the left edge on an opaque fill
(`TABLE.stickyNameCell`, `TABLE.stickyNameHead`), with the row's hover tint
laid over it as a gradient. On a phone it opens no wider than 45% of the
sheet (`TABLE.nameCap`), and a longer name truncates. A name, a number that
links to Windy and a footnote mark are links in their text's own colour
(`LINK_QUIET`): no underline at rest at a desk, one on hover and keyboard
focus, and a thin one at rest in the secondary ink on a touch screen, which
has no hover to show a link by (record [0212](decisions/0212-links-underline-on-hover-and-touch.md)). The chart's plot leaves the browser only the
vertical pan (`CHART_PLOT_TOUCH`), so a sideways drag reads it.
Record: [0142](decisions/0142-sticky-name-column.md) Record: [0144](decisions/0144-chart-reads-a-finger.md)

### Motion

Two speeds, each the same both ways (#714). A menu or a card fades and slides
in 150ms (`MOTION.menu`). A panel, a sheet or a results pane moves in 300ms
(`MOTION.slide`, `MOTION.push`, `MOTION.pane`), because it moves an edge the
whole screen is laid out against. Each recipe names the one property it
moves, so nothing a grip drags is ever animated, and each stops under a
reduced-motion setting. `PANEL_MS` is the slower speed in numbers, and
`styles.test.ts` holds each class to its speed.

The desk panel pushes the map's edge rather than sliding over the map
(`DESK_PANEL`). It stays in the row while it is shut and its left margin takes
its 360px back, so the map's column narrows and widens in the frames the panel
moves in, its left edge on the panel's right edge in every one. Nothing is
painted over anything. A results pane at a desk opens and closes on a Table,
Chart or Both press and on the collapse chevron (`RESULTS_PANE`): one grid
row, `1fr` open and `0fr` shut, around a body that keeps its own height. An
opening pane mounts its body at the press at the height it will stand at, so
the chart is drawn once and the data is on screen as the frame uncovers it.
The chart comes down from the results bar and the table up from the column's
foot. A shut pane keeps its body, inert and drawing nothing new, so the next
press opens a frame around a body already drawn.

While the layout moves, the map's box and the panes' bodies hold one size
(`LAYOUT_HOLD`), so a frame moves boxes instead of resizing the map or laying
out the table again. At 946 destinations in the pinned browser image, a close
went from one 77ms frame and a slide over the map to 8 frames: one of 51ms
where the map and the table take the new width, then frames of 34ms. An open
went from one 77ms frame to 11 frames of about 30ms and one of 46ms where they
take theirs (medians, 2026-10-20).

At 167 destinations a pane press that mounts a body commits in 84 to 142ms,
and each move then runs 11 to 17 frames, the longest of them 20 to 45ms, with
the chart or the table in every frame the pane stands part open. The chevron
moves in 14 frames shut and 15 open. At 946 the mount takes 383 to 707ms, and
some presses then show only one or two frames of motion (medians,
2026-10-21).
Record: [0202](decisions/0202-panel-and-panes-move-at-one-speed.md)

While the panel moves, the panel, the map's column, the results and each
pane's body stand on layers of their own (`LAYOUT_HOLD.layer`), so a frame
shifts layers rather than painting them again: at 200 rows a close painted for
195ms in all and now paints for 34. Since #786 a pane press opens a body
already drawn rather than mounting one, so Table to Both starts moving 54ms
after the press rather than 120 (2026-10-22).
Record: [0216](decisions/0216-desk-moves-paint-less.md)

The chart stands at one size in every mode at a desk. Its legend is a pane
of its own between the chart's and the table's (`CHART_LEGEND`), so Chart to
Both shuts it as the table opens, and Chart sizes the chart the way Both does,
keeping the table's floor free under it for the legend. No press between them
draws the chart again (#795).
Record: [0218](decisions/0218-chart-legend-is-a-pane.md)

### Control width

Every stacked panel control composes `CONTROL_W = 'w-[118px]'` = 118px.

- The label takes the free space (flex-grow)
- The control takes `CONTROL_W`
- Both share a baseline in a flex row

118px is not a taste. It is 2 x `METRIC_BOX_W` + the Metrics grid's `gap-x-1.5`, so the Forecast section's model picker and its two segments stand on exactly the edges the bound boxes below them do. The panel is one column at 225 and 343, measured. It was 144px, set by the widest segment label, until the Metrics row's label budget forced the narrower boxes and left the two sections 26px apart. `styles.test.ts` derives the sum from the roles.

The Metrics table still sizes nothing by that token. Its row is the panel's widest — radio, label, aggregate menu (`SELECT_W_AGGREGATE`, 72px), Min box and Max box (`METRIC_BOX_W`, 56px each) — and the label has to hold `Freezing level` at text-xs inside the panel's 327px of content, which is 317px beside the 10px scroll bar the body keeps room for since #697. The direction segment above the rows spans the two box columns and wears `SEGMENT_FILL`, because a fixed width in a grid cell states a number the tracks already decide.

Four controls in that section share one pair of edges: the direction segment, the results cap box, the Clear filters button, and every bound pair. The three wide ones span the two box columns rather than spelling their sum, so the width lives in `METRIC_BOX_W` alone. Clear filters is always drawn and disables when there is nothing to clear, so the section's last row never moves.

Nothing is drawn between the section's two blocks. `METRIC_HEAD_GAP` is the whole separation: 8px of padding above the heading row, which is what tells the two controls that order the list from the table of bounds under them.

**Segment arithmetic:** 118px less the 2px border and the 1px divider is 57.5px a half. The longest words are `Highest` at 43.69px and `Current` at 42.89px, both at text-xs, so `SEGMENT_ITEM` carries a 4px inset leaving 49.5px. An 8px inset leaves 41.5px and clips them both, which is why there is one inset for every segment in the panel rather than two. Checked in `styles.test.ts`.

**The chevron:** `SELECT` reserves `pr-6` = 24px, which is the chevron's own box and nothing more — `ICON_ADORNMENT` puts a 16px glyph 8px from the edge. It reserved 32px until the column came down to 118px, where those 8px were the difference between `UK Met Office` (79.69px) fitting the model picker's 84px of label and truncating. `Meteo-France ARPEGE` at 130.03px fits no trigger the panel can offer and truncated at 144px too.

**Arithmetic:** `327 − 14 (radio) − 10 (label gap) − 3 × 6 (grid gaps) − 72 − 2 × 56 = 101px` for the label, and 91px with the 10px bar's room taken off. The noun's measured width is pinned beside that sum in `styles.test.ts`; re-measure before moving a width, the gap, or the nouns.

### Welcome dialog height

The welcome dialog is a `max-w-md` card on a `p-4` backdrop, so it is 448px wide at a desktop width and 328px wide on a 360px phone, where the copy wraps further. Measured 2026-09-16 in Chrome 153 on macOS, against the built bundle.

- The card's content column is **821px** tall at 448px wide and **1029px** tall at 328px wide
- The backdrop's padding and the card's border take 34px of the window, so a card that does not scroll needs **855px** of viewport height at a desktop width and **1063px** at a phone width
- The dialog has neither: a 768px-tall desktop viewport leaves it 734px and a 360 x 640 phone leaves it 606px, so it scrolls at both

**There is no no-scroll budget to spend.** `max-h-full overflow-y-auto` is what the card wears instead, so the dialog is read by scrolling rather than at a glance. Since #687 the two actions stand in `DIALOG_FOOT`, which sticks to the card's bottom edge inside that scroll box, so Search now and Take the tutorial are on screen at 1024x768 before the reader scrolls at all. That is why the third step covers the whole Metrics table in one line rather than a step per question: another step lengthens a card the reader already scrolls. `WelcomeModal.tsx` points here for these numbers.

**Re-measure condition:** a new step, a change to the `PROSE` sizes the card is set in, or copy that adds a line to any step. The binding case is the phone: the desktop column is 208px shorter.

## Tailwind v4 facts

**Color resolution:** competing color utilities resolve by their order in the generated stylesheet, not their order in the class list. So a role's color cannot be overridden at a call site — the role always wins. This is why every hue is centralized: a component cannot brighten or dim a color it was handed.

**Raw text scanning:** the build step scans source files as raw text to find class names, so a class quoted in a comment or a test emits its CSS. For example, writing `// don't use rounded-xl` in a component file would add `rounded-xl` to the bundle even though it's commented out. The lints and role definitions avoid this by building patterns that don't form the literal class name — e.g., using regex alternation instead of quoting the exact string. The `content` list in `tailwind.config.js` is not the whole scanned set: v4 auto-detects sources beside it, and `frontend/tools/` was being scanned until `@source not "../tools"` went into `src/index.css`. Measured on 2026-09-15: without that line the ESLint fixtures emitted five real utilities into the text-page bundle, and a stray `.lowercase` had already been leaking from `tools/` before they existed. That exclusion is what lets the ESLint rules spell a class where `styles.test.ts` may not, and `styles.test.ts` pins the line.

## Copy rules

### Tooltips need permission

Knowledge belongs in labels, captions, empty states, or docs. A tooltip is the
last resort, and adding one is **not a call a contributor makes alone** — ask
the maintainer first. Recommending one is welcome; adding one unasked is not.

This was an absolute ban until 2026-08-04, enforced by a lint. The ban is now a
policy instead, because the lint could not tell an approved exception from a
lazy one and would have had to be deleted to ship the first approved exception,
which teaches people to delete lints.

What has not changed is *why* the rule exists. **A tooltip does not exist on
touch.** A phone has no hover, so anything a tooltip carries is simply gone for
those readers. That is a real cost every time, and it is why the answer is
usually to shorten the label, fix the control, or delete the sentence instead.

The ones in the tree today, each approved on its own:

- The Metrics table's *"Destinations with no air quality forecast are
  included."* rides as a `title` on the air-quality row — its label and both
  bound boxes, the one row whose value can genuinely be missing — rather than as
  a standing line under the table. That bought back the line of height that made
  the panel scroll, and the fact stays discoverable in the table (a dash) and in
  `docs/DATA.md`.
- The Max results row's *"Only limits how many destinations are added to the
  results. All destinations are still forecasted."*, on its label and its field,
  because the control reads as a cap on the work and is a cap on the rows.
- One disabled control says why it is disabled: the Forecast grid row over a
  report carrying archive hours (#123). A disabled control says that it cannot
  be used and never why, and the reason cannot be read off the panel. The model
  picker's reason over an archive window was a tooltip here until it moved into
  the panel's message block (2026-09-14), which is why `ModelPicker.tsx`'s
  approved count is pinned at zero.
- The freezing-level cell's *"Freezing level is only available from the GFS
  Seamless, HRRR and ICON models."* answers a question only that cell raises:
  it reads `N/A` rather than a number, and without the note the reader cannot
  tell a model that does not carry the variable from an app that failed to
  fetch it. It is the same `N/A`-plus-`title` idiom the Wildfire (mi) column
  uses for a row it could not check, so the table has one spelling of "no
  answer here, and here is why" (TJ, 2026-09-12, asked for with the metric
  itself in #295). What keeps the touch cost bounded is that the mark itself
  is honest without the note, and `docs/DATA.md` carries the full explanation.
- The table's **Closure** cell carries two (#550, #551). One is the hover
  sentence on an unlinked cell: why an `N/A` reads `N/A`, as on the Wildfire
  (mi) cell, or which order a row stands in when the Forest Service gave that
  order no page. The other is the order's whole title on a linked cell,
  because the cell clips a long one.
- The Hourly segment, the smoke legend's density chips, and the table's
  **Wildfire (mi)** cell, each documented where it is used.

Every one of them is counted in `styles.test.ts`, which fails an unapproved
addition and an accidental deletion alike.

**A tooltip that carries a reason carries it twice.** Where the sentence is the
only thing explaining a state, the same text is also mounted in a visually hidden
element that `aria-describedby` names (`SR_ONLY` in `styles.ts`), because the
touch argument above applies to a screen reader as well: a `title` is a pointer's
affordance and is not promised to anything else. The linter's
`disabled-reason-twin` check fails an `aria-describedby` in `LayersPopover.tsx`,
`ResultsTableHeader.tsx`, `ResultsTableRow.tsx`, `ForecastCalendar.tsx`,
`MapLegend.tsx` or `ColumnsPicker.tsx` with no `SR_ONLY` twin. A sentence on an element with no role
(the table's `N/A` reasons, the smoke legend's density letters) is mounted inside
that element's own cell or chip, because a screen reader reads a description only
on something it can focus, and reads content wherever it is (#576).

### Sentence case

All UI copy is sentence case (capitalize first word and proper nouns only). Acronyms keep capitals: "AQI", "OSM".

### Error messages and remedies

Errors end with period and a standing sentence: `Try again later.` This has two exceptions:

- Parse failures carry no remedy tail (e.g., "Invalid coordinate format.")
- Model coverage messages name the remedy (e.g., "{model} has no forecast coverage for this area. Switch to a different model and try again.")

Remedies only work where they work. A generic "try again" for a network error does not help if the network is down. Failing that test, omit the remedy and show only the state.

The over-cap refusal states the problem only ("This search covers N peaks. The analysis limit is M destinations."). Its machine-readable remedies live in the API's structured fields, never in the prose (TJ, 2026-08-22).

### Every message is a box

There is no unboxed message. Every line in the list the Analyze button's badge
opens is one of the three `NOTICE` boxes, and severity is the only thing that
varies. A `CUE` role once held a centred, borderless
variant for the commit cues, and the footer showed a cue in amber text directly
above a blocker in an amber box, saying the same kind of thing in two shapes.
The one bare `STATUS` text left in the panel is the polygon's draw counter,
which is a field's own readout beside the field rather than a message about the
analysis; the linter's `style-draw-counter` check pins it by count. Since #687
the point count is `DrawReadout`, which the panel and the phone's draw bar both
render, so `style-draw-readout` pins its four states there and the panel keeps
two.
Record: [0208](decisions/0208-analyze-button-counts-the-messages.md)

### No raw exceptions or status

Never surface an exception type or HTTP status directly. Write a sentence instead.

### Where the data hues live

The no-hue lint is an ESLint rule and scans `components/`, `map/` and `App.tsx`. The app's data colours, the
band ramps a marker, a grid cell and the legend all read, are `METRIC_SCALE` in
`frontend/src/utils/colors.ts`, one scale per metric family, the freezing level
included since #295 was reversed (2026-09-14). That file is the one place
outside `styles.ts` allowed to name a hue, because a band's colour is what the
number means rather than what the surface is. `snowDepth.ts` is the same
exemption for the same reason: those bands are NOAA's, and the map draws NOAA's
rendered image.

Neither of them decides how a scale is DRAWN. That is `utils/legendRamp.ts`,
which turns a band table into the legend's strip and the tick numbers on it, and
is shared by the metric key and the snow key so the map cannot carry two shapes
of scale. **Every strip blends**, mirroring `interpolateRgb`, which is what makes
a metric strip a picture of its own markers. The snow strip was hard-stopped
until #460, because NOAA's bands are a classification and a gradient shows
depths NOAA never assigned a colour to; that cost is accepted rather than
solved, because one box holding a strip of blocks beside a strip of gradient
reads as two systems (TJ, 2026-09-22). A blend makes a band an anchor at a
boundary rather than a block between two, so colour `i` lands at boundary
`i + 1` and a tick naming that band is placed there. The ticks are
the thresholds themselves, formatted — never a caption written beside them — and
they carry no unit: the section's label does, composed by `metricLabel` in
`metrics.ts` from the SCALE's own unit, so playback's swap to the hourly rate
relabels the strip with its bands.

**A tick stands on the strip, and that is what the scrim is for.** No single ink
clears AA over a ramp that runs the whole hue circle: white measures 1.45:1 on
the freezing level's cyan-300 and slate-900 measures 2.04:1 on its purple, and every
metric ramp and all eleven snow bands have an end like each of those. So the
numbers sit on a `bg-slate-900/70` band along the strip's bottom edge, where
slate-200 measures **6.48:1** against the worst band under it. A text shadow was
the alternative and is not measurable, which is the whole reason this one is
pinned in `styles.test.ts` as `RAMP_INK` — change the ramp colours or the scrim's
opacity and the number has to be taken again.

**The marker's rank digit stays white on its band, with no halo.** It lands on
every band colour every scale has, and white measures 1.05:1 to 3.96:1 on all but
the verdict ramp's maroon and the no-value grey. A 1.5px slate-900 halo would lift it to
17.85:1 and was built for #576; the maintainer declined it on sight as too heavy
(2026-10-01). The ratios are dated evidence in the record, so the next session
does not re-propose the same fix blind.
Record: [0091](decisions/0091-rank-digit-stays-plain-white.md)

### Model coverage message

The one message mirrored between backend and frontend: "{label} has no forecast coverage for this area. Switch to a different model and try again." Defined in `backend/app/services/weather.py` (`_coverage_message`). The browser spells it once, in `frontend/src/utils/openMeteoErrors.ts`: `COVERAGE_PHRASE` is the first sentence and `COVERAGE_MESSAGE_TAIL` adds the remedy. `analysisFailure.ts` composes the tail with the picker's label, `useModelCompare.ts` composes the phrase alone, and neither types the words. The `OpenMeteoModelCoverage` error carries no message at all, because only a catch site knows the label (#391).

### Styling a native range input

A range input is worth taking over a hand-rolled track for what it arrives
knowing: arrow keys, Home and End, an announced value, and a drag a finger can
do. What it does not arrive with is a look — it paints from the *system*
palette, so a light-mode OS renders a pale track inside a dark map card, the
same trap `SELECT` documents.

Suppressing that takes three declarations, not one, and missing any of them
ships a control that looks native on half the machines it runs on:
`appearance-none` on the input, `[&::-webkit-slider-thumb]:[appearance:none]`
for WebKit and Blink, and `[&::-moz-range-thumb]:[appearance:none]` for
Firefox. Each engine ignores the spelling it does not own. `styles.test.ts`
asserts all three.

The filled portion of the track is a third element behind the input rather than
a styled `::-webkit-slider-runnable-track`, because a pseudo-element cannot
carry another box on top of it, and it needs `pointer-events-none` so it does
not swallow the drag that belongs to the input above.

### Drawing an icon

Every glyph in the app is a component in `frontend/src/components/icons.tsx`,
and nothing else draws an SVG (#386). Before that module the nineteen inline
SVGs each answered the same three questions for themselves and had stopped
agreeing: the close cross existed six times at three sizes and two stroke
weights, two of the six reached a screen reader that the other four did not,
and the select arrow's path was typed out three times.

The split is:

- **The module owns the drawing.** Paths, stroke weight, viewBox, the size from
  the `ICON` ramp, and `aria-hidden` on every one of them. A glyph stands inside
  a control that already carries its own `aria-label`, so an icon that reaches
  the accessibility tree can only announce the label a second time.
- **The call site owns placement.** Where the glyph sits (`ICON_ADORNMENT`,
  `flex-shrink-0`) and what colour it reaches for (`ICON_ACTION`), passed as
  `className`. Never a size: a height or width handed to an icon fails the
  linter's `style-call-site-classes` check.

To add one, write the component in that file, give it a step from the `ICON`
ramp, and let it set `aria-hidden` itself. A step that does not exist yet is a
new role: add it to `ICON` with its rationale and pin its pixels in
`styles.test.ts`, the same way as below. The ramp is four steps and each one
states the number that chose it (#436), so a fifth arrives with a measurement
or not at all — the key set is pinned as well as the values.

**The one glyph drawn twice.** A map popup is an HTML string handed to
MapLibre's `setHTML`, so Tailwind never sees its class names and the icon
module cannot draw it. The link-out arrow in a popup's title row is therefore
the same shape as the results table's, read from `frontend/src/iconPaths.ts`
by both `icons.tsx` and `utils/popup/popupChrome.ts` (#435). That module carries the
geometry, the stroke, and the one size a string has to spell; the linter's
`style-popup-glyph` check bans a literal SVG tag in `popupChrome.ts`, and
`styles.test.ts` pins that size to the `inline` step. It sits at `src/` rather than in `components/`, beside `styles.ts` and
`metrics.ts`, because `popupChrome.ts` is a util and no util in the app imports
a component.

### Opening a menu

Every desk menu is one card on one hook (#714): `components/Menu.tsx` draws the
card and the trigger, and `hooks/usePopover.ts` places the card and closes it.
A component supplies its rows and nothing else.

`Menu` owns the card: the chip card's `menu` surface, `LAYER.popover`, the
fixed box, the portal to `document.body` and the motion
in and out (`MOTION.menu`; `hooks/useExit.ts` keeps a closed card for its
exit). The box is fixed and portalled because the control panel is an
`overflow-y-auto` column, which would clip a card inside it at the scroll
boundary and cut a low control's list in half. `MenuButton` owns the trigger.
`MenuSelect` is a trigger and its list, in place of a native select.

The linter fails a second `position: 'fixed'` or a second copy of the card
anywhere under `components/` (`style-own-menu`), and a second caller of
`popoverBox` (`style-one-placement`).

Every desk menu wears the Layers menu's card: 4px under its trigger, never
joined, whole corners, the opaque chip card fill and the overlay shadow. It is
never narrower than its trigger and otherwise as wide as its rows. It lines up
with the trigger's left edge, or its right edge where the left would run it off
the panel or the window. It opens above only when the room below is under three
44px rows and the room above is larger. Two menus take a set width: the model
list takes the Model row's, lined up with the field's right edge, and the
calendar takes its field's. Columns, Models and Removed each open under their
own button. The search results keep their place under the pill and take the
card's surface.
Record: [0201](decisions/0201-one-menu-for-every-trigger.md)

Triggers come in three shapes, on purpose (`MENU_TRIGGER`): a pill on the map,
a field in the panel or over the chart, and a button in the results bar. Each
carries the chips' chevron after its label, down while shut and up while open.
Download CSV opens nothing and has none. Under the pointer the edge and the
label take the accent; a bar button has no edge, so only its label does. While
its menu is open, a pill or a bar button fills with the accent and a field
keeps its accent edge.
Record: [0201](decisions/0201-one-menu-for-every-trigger.md)

At a desk the chart's metric and each Metrics row's aggregate are menus. A
native select opens the platform's own list, which no stylesheet reaches. The
arrow keys, Enter, Space and Escape work as on a select, and the keyboard
returns to the field when the list closes. A phone keeps the native select,
whose picker rises from below like every phone menu.
Record: [0201](decisions/0201-one-menu-for-every-trigger.md)

The Layers chip's card is where the one menu came from. Squaring a 32px pill's
bottom corners left a dome, so the chip stays a whole pill, lit while its card
is out as a phone's is, and the card stands 4px under it from its left edge
(`MAP_CHIP_MENU`). An 8px gap, the same as the one between the pill and the
chip row, made the card read as a row of its own.
Record: [0174](decisions/0174-desk-map-rows.md)

On a phone every menu is a sheet instead (`BottomSheet`, `BOTTOM_SHEET`): a
card from the bottom edge over a dimmed map, with a grip, its heading and
Done, and rows a finger's 32px tall with a rule between them (record [0223](decisions/0223-finger-controls-draw-32.md)). Layers and
Legend from the chip row, the model list and the calendar from the Controls
sheet, and Columns, Models and Removed from the results bar open in it. The
model list and the calendar are `Menu`'s rows in a sheet (`sheet`), so they
are written once for both widths. The Controls sheet is the same sheet, kept
mounted (above). The dim covers the whole screen, the search row and the chips
included, as a modal sheet's scrim does in Material. The grip and the title
row drag the sheet, to just under the chips, shut, or anywhere between, and a
double tap on the grip puts it back at its own height, through the gesture
the results sheet's grips use.
Record: [0136](decisions/0136-phone-menus-are-bottom-sheets.md) Record: [0146](decisions/0146-sheet-grips-drag.md) Record: [0201](decisions/0201-one-menu-for-every-trigger.md)

### Adding a new role

1. Write the role in `styles.ts` with a rationale comment explaining what it is for
2. Add an assertion in `styles.test.ts` that pins the role's properties (size, color, weight, etc.)
3. Ship both in the same PR

A ban on a call site is the other file: a rule that a pattern over class names
can decide belongs in `eslint.config.js`, not in a test.

The assertion is what makes a change to a role visible in code review rather than buried in a stylesheet.
