# Design System

Bluebird Forecast's frontend design lives in `frontend/src/styles.ts`, which exports the roles every component composes. This page documents what each role is for, what is enforced, and the measured numbers that keep the app consistent.

## Roles

**Text ramp**

| Role | Purpose |
|---|---|
| `TEXT.appTitle` | Panel identity in the header |
| `TEXT.section` | Panel section headings |
| `TEXT.subheading` | Named sub-blocks and field labels |
| `TEXT.cta` | Single call-to-action text, step up from body |
| `TEXT.control` | Anything you read or type in a control |
| `TEXT.caption` | Secondary text: taglines, descriptions, notes |
| `TEXT.helper` | Italic prose explaining a control |
| `TEXT.overline` | Tiny all-caps labels: popover headers, search result kinds |
| `TEXT.micro` | Attribution, timestamps, overflow counts |
| `PROSE.title` | Dialog heading |
| `PROSE.subtitle` | Line under dialog heading |
| `PROSE.heading` | Heading inside body copy |
| `PROSE.body` | Reading-tier body copy |
| `PROSE.strong` | Inline emphasis (no size, modifies its container) |
| `PROSE.note` | Same as `TEXT.caption`, shared between densities |

**Links**

| Role | Purpose |
|---|---|
| `LINK` | Ambient link: data credits, provider lists, privacy dialog |
| `LINK_ACTION` | Link inside content: results table destination names |

**Surfaces**

| Role | Purpose |
|---|---|
| `SURFACE_PAGE` | The ground a full page stands on: the app's root, the standalone pages' frame, and the error boundary's fallback, which replaces the tree it guards and so cannot borrow a ground from it |
| `SURFACE_CARD` | Opaque cards above a scrim: dialogs, analysis overlay |
| `SURFACE_FLOATING` | Boxes floating over the map: search field, the legend, chart tooltip, the forecast player's transport bar |
| `RECESSED_FILL` / `RECESSED_EDGE` | The well every recessed surface composes: slate-900 fill and a slate-500 border, which clears 3:1 against the panel. Fields, selects, segments and the legend all start here |
| `SURFACE_POPOVER` | A floating box that is a menu rather than a key: the map's Layers popover and the search result list, lifted off the legend by one step of fill and a heavier shadow |
| `SURFACE_SHEET` | The results on a phone, standing on the map's bottom edge: the docked panel's fill, the map's floating edge, the surface radius on the top corners only |
| `SURFACE_GROUP` | Bordered region grouping controls: the calendar |
| `SURFACE_GROUP_BLEED` | Cancels a well's inset so its contents sit on the panel's control column |
| `SURFACE_DIVIDER` | The quiet rule between two blocks of one surface, where the panel's stack cannot draw it: a dialog header over its body, a popover's overline strip over its rows, the panel's own right edge against the map. A bare colour, so the call site supplies the side |

**Buttons**

| Role | Purpose |
|---|---|
| `BUTTON_PRIMARY` | Full-width main action: Analyze button |
| `BUTTON_SECONDARY` | Secondary action beside something else |
| `BUTTON_ACCENT` | Leading action in a pair: Done button in draw mode |
| `BUTTON_DANGER` | Destructive retry inside an error notice |
| `BUTTON_FLOATING` | Pressable floating box: the Controls and Layers buttons, the map's only two |
| `BANNER_PREVIEW` | The preview-deployment banner, the one surface that is deliberately loud: white on red-600, 4.76:1 |

**Fields and controls**

| Role | Purpose |
|---|---|
| `FIELD` | Text input, recessed fill with border |
| `FIELD_NUMERIC` | Number input with browser spinners suppressed |
| `SELECT` | Native dropdown, recessed fill with suppressed platform chrome |
| `DISABLED` | The faded, unpressable look of a control that does not apply; composes over any button or field role and carries no color of its own |
| `MUTED` | The other half of that pair: a control that is not the one in force but still works. 60% against `DISABLED`'s 40%, unscoped, and no cursor change, because a press still does something. 60 rather than 50 because a working control's text owes 4.5:1: the slate-200 label measures 5.25:1 on the panel, 5.96:1 on an idle metric select and 5.43:1 on an unplotted chart chip, where 50% was 4.11, 4.58 and 4.22 |
| `SR_ONLY` | Text for assistive technology only, the twin of an approved tooltip |
| `CHOICE_ROW` | Radio or checkbox and its label as one strip |
| `CHOICE_INPUT` | The box itself inside a choice row |
| `SEGMENT` | Geometry of a panel segmented control (fixed to `CONTROL_W`) |
| `SEGMENT_FILL` | Segmented control sized by the box it is placed in, for a row whose column is not the panel's (the Metrics direction row) |
| `SEGMENT_FLUID` | Segmented control outside the panel column, sized by content |
| `SEGMENT_FLUID_LIFTED` | The same segment on `SURFACE_POPOVER`, wearing the edge that surface needs |
| `LIFTED_EDGE` | A well's boundary on `SURFACE_POPOVER`: slate-400, since slate-500 clears 3:1 only against the panel |
| `SEGMENT_IDLE` | Unchosen half of segmented control |
| `SEGMENT_ITEM` | Individual segment half with padding and transitions |
| `SEGMENT_DIVIDER` | The rule between two segment halves |
| `CONTROL_SIZE` | The one type size every control reads at (`text-xs`); `SLIDER_VALUE` and `SLIDER_WORDMARK` compose it |
| `SELECT_W_AGGREGATE` | The aggregate dropdown in a Metrics row: 72px (w-[4.5rem]), the widest aggregate word (28px) plus the field's 8px padding and the 24px `SELECT` reserves for its arrow, with 12px of deliberate slack because the width also sets a grid track |
| `CAPTION_LIFTED` | `TEXT.caption` re-derived for the slate-700 fills: a search result's description on `SURFACE_POPOVER`, and the window caption on the results sheet's header bar. slate-300 (6.97:1) because slate-400 falls to 3.93:1 on that fill |
| `SLIDER_OVERLAY` / `SLIDER_VALUE` / `SLIDER_WORDMARK` / `SLIDER_IDLE` | The coverage slider in the Layers popover: the transparent range input laid over the drawn track, the value readout at `CONTROL_SIZE`, the in-track wordmark at the same size in sentence case, and the idle tint |
| `PANEL_EDGE` / `PANEL_RULE` | The panel's own border tint, and the rule between the panel's sections, drawn from the stack so a section added later cannot forget its line. `SURFACE_DIVIDER` above is the same quiet line where a call site has to place it by hand |
| `BADGE_STEP` | The step-number badge in the welcome modal, derived from `ACCENT.fill` |
| `SWATCH_CHIP` | A legend swatch that carries a letter: the smoke section's three density chips, side by side so the opacity ramp reads against itself |
| `SWATCH_RAMP` / `SWATCH_RAMP_SCRIM` / `SWATCH_RAMP_TICK` / `SWATCH_EDGE` | A legend key that is a SCALE rather than one colour, drawn as a strip across the box: the five metric scales and the snow depth layer (#454). ONE line whatever the band count, where a row per band was seven lines and eleven. The numbers stand INSIDE the strip on the band boundaries they name, which is a grid over the strip rather than a row under it, so a five-band key costs a label and 20px. `SWATCH_RAMP_SCRIM` is the slate-900/70 band they stand on and `SWATCH_RAMP_TICK` the slate-200 they are drawn in; see the contrast rule below for why the scrim is not optional. `SWATCH_EDGE` is the slate-600 every swatch is edged with, a VALUE rather than a class because the fill beside it is inline and two colour utilities resolve by stylesheet order |

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
| `FOCUS_RING_INSET` | The same outline drawn inside the edge: the results table's sticky headers, where an outer ring is clipped by the scroll box and lands on the first row (sky-400 is 4.74:1 on the slate-700 bar) |
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
| `NOTICE_DISMISS` | The X that dismisses one footer message; hidden until its row is hovered, always visible on touch |
| `NOTICE_DIVIDER` | The rule between two messages in one notice box: the box's own border tint, 6px clear on each side, and no rule at all under a lone message |

**Spacing and sizing**

| Role | Purpose |
|---|---|
| `RADIUS.control` | Form controls, small buttons, inline chips |
| `RADIUS.surface` | Floating cards, dropdowns |
| `RADIUS.pill` | Pills, dots, spinners, progress bars |
| `TAP.action` | Button-shaped tap target: 44x44 on coarse pointers |
| `TAP.row` | Left-aligned tap target: 44px height on coarse pointers |
| `TAP.height` | Height-only tap target for already-laid-out content |
| `TAP.grip` | Full-width drag handle: 24px height (AA floor, not 44) |
| `CONTROL_W` | Single stacked panel control width: 118px, which is 2 x `METRIC_BOX_W` plus the Metrics grid gap, so the whole panel stands on the bound boxes' edges |
| `CHART_METRIC_W` | The chart's metric select, 144px (w-36). The one control that borrowed `CONTROL_W` from outside the panel and cannot follow it down: `Freezing level (ft)` is 99.3px |
| `MAP_COL_W` | Width of everything in the map's left column but one: the search field, the Controls and Layers buttons, the Layers popover and the legend box. 184px (w-46), governed within a pixel by two rows, the grid legend's wait line (176.8px) and the search field at rest (177.6px). The exception is the search RESULT list, deliberately wider (w-72/w-80): bound to the column it clipped the county and state that tell four places of one name apart |
| `MAP_ROW_H` | Height of one row in that column: 36px, floored at 44px on a finger. Fixed, because the search field and the two buttons each solved for their own height and came out 34, 38 and 38 |
| `MAP_COL_GAP` | The gap between members of that column: 4px, half the 8px they took before. A role rather than four call sites, because `LEGEND_TOP`'s arithmetic is built from it. `MAP_COL_GAP_T` is the same gap as a top margin, for a popover that hangs rather than sits |
| `LEGEND_TOP` | Where the legend stack hangs under that column, in four numbers: two pointer sizes, each with and without the Controls button, which stands in the column only while the panel is collapsed. `resultsSheet.ts` mirrors two of them as `LEGEND_TOP_PX` and `LEGEND_TOP_FINE_PX`, and `resultsSheet.test.ts` reads `styles.ts` as text to hold the pairs together |
| `MAP_EDGE` | How far anything floating on the map stands off its edge: 12px, published once as `--map-edge-inset` on the map wrapper and read by the button column, the legend stack and MapLibre's own control stack. The same publisher carries `--map-credit-size` at the ramp's smallest step, so `map.css` can size the library's credit line from the ramp |
| `MICRO_SIZE` | The ramp's smallest step as a utility. `MAP_EDGE.publish` spells the same 10px a second time as a custom property, because Tailwind compiles no interpolated class and the library's credit line has no call site; `styles.test.ts` holds the two to one number |
| `METRICS_GRID` | The Metrics table: label, aggregate dropdown, Min box, Max box; the control columns are `auto`, sized by the roles their controls wear |
| `METRIC_BOX_W` | One bound box in the Metrics table: 56px (w-14), the widest the metric row's label budget allows. The results cap spans both box columns instead, so it wears `w-full` off the same shape |
| `METRIC_HEAD_GAP` | The Metrics table's one deliberate break: 8px (pt-2) above the two box headings, on every cell of that row because the columns are grid tracks. The only vertical space in the grid that `gap-y` does not set |

**Moving a column**

One set of roles for both surfaces that reorder columns, the table header and the Columns picker, so a gesture that means "this moves" looks the same in either.

| Role | Purpose |
|---|---|
| `DRAG_GRIP` | The handle itself. `cursor-grab` is the standing signal; `touch-none` is load-bearing, because without it the browser claims the gesture for scrolling and the drag never gets a second pointer event on a phone |
| `DRAG_GRIP_ACTIVE` | The grip while its own column is the one being carried |
| `CARRIED` | The column where it used to be, while the ghost is under the pointer. `DISABLED`'s 40 percent without its cursor, because that column still sorts the moment the drag ends, and not `MUTED`'s 60, because it is faded for where it is rather than for what it does |
| `DRAG_GHOST` | The column riding under the pointer. Portalled to the body and positioned in viewport coordinates, so it carries `LAYER.popover` itself rather than asking the call site for it; `pointer-events-none` is load-bearing, or the ghost is what every hit test finds |
| `DRAG_INSERT` | The bar marking the gap the column will drop into. The accent's fill without its label color, since the bar carries no text, and the same layer as the ghost |

**Map timeline**

| Role | Purpose |
|---|---|
| `SCRUBBER` | The timeline's `<input type="range">`: suppresses the platform slider on every engine that draws one, and draws the thumb |
| `SCRUBBER_TRACK` | The rail behind it, on the same recessed surface as every other well |
| `TRANSPORT_AXIS_ITEM` | The axis switch's halves: `SEGMENT_ITEM` with one step more inset, because the right half carries a ranked metric's noun rather than a word the app chose. That half also holds one line and takes the width its own noun needs, where a panel half splits a fixed box with its neighbour |
| `TRANSPORT_AXIS_W` | The floor under both halves: the width `Radar` takes, so a one-word metric beside it is a matching half rather than a runt. Spelled again under `touch:`, because the tap target's own min-width is a later rule and would otherwise lower it |

**Layers**

| Role | Purpose |
|---|---|
| `LAYER.base` | Map chrome, sticky header, docked panels |
| `LAYER.sheet` | The phone results sheet: over the map chrome it covers, under the drawer's scrim |
| `LAYER.mapControls` | The map's top-left cluster and what it opens: over the sheet and the map chrome the Layers popover hangs across |
| `LAYER.overlay` | Analysis overlay card |
| `LAYER.scrim` | Scrim behind mobile drawer and preview banner |
| `LAYER.drawer` | Mobile drawer itself |
| `LAYER.popover` | Popover opened from drawer (above drawer, below modal) |
| `LAYER.modal` | Modal dialogs |

**Tutorial**

| Role | Purpose |
|---|---|
| `TOUR` | The tutorial's card and its parts, which `tour/runTour.ts` adds to the elements Driver.js builds: the dialog card, a heading and body line, the progress caption, the panel's inline button pair (secondary back, accent forward), and `ICON_BUTTON` for the close. Driver's own stylesheet sits under Tailwind's in `tour.css`, so these win wherever the two disagree |
| `TOUR.sandbox` | The box the demo copy of the app stands in, over the whole screen while the reader's app is hidden under it. No z-index, so the demo's layers and its portaled panels stack against each other as the reader's do |
| `TOUR.frame` | The clear box Driver lights, which the run keeps over the union of a step's targets, because one action spans a control and the panel it opens |
| `TOUR.pointer`, `TOUR.pointerArrow`, `TOUR.pointerPress` | The drawn pointer that acts each step out: one layer above Driver's dim and under its card, a white arrow with a slate edge (the one pair that reads over both the dim and the map, and no hue, since the pointer is no control of the app's), and the white ring a press sends out. It glides only where motion is welcome |
| `TOUR_DIM`, `TOUR_STAGE_PAD_PX`, `TOUR_STAGE_RADIUS_PX` | The dim around the lit target and the cut-out's clearance and corner, as numbers rather than classes because Driver draws the stage in SVG. The dim is the welcome dialog's backdrop, and the corner is `RADIUS.surface` |

**Calendar days**

| Role | Purpose |
|---|---|
| `DAY.cell` | Calendar day cell box with tap target height |
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
| `ICON_BUTTON` | Bare icon button in header |
| `ICON_ACTION` | Icon that acts on hover |
| `ICON_ADORNMENT` | Glyph drawn inside a field |
| `SPINNER` | Indeterminate spinner |
| `TABLE.cell` | Results table cell inset |
| `TABLE.row` | One data row: the rule above it and what it does under a pointer. Both the pending destinations and the ranked results wear it |
| `TABLE.head` | Results table header cell |
| `TABLE.rankStack` | Rank cell: number and remove × in one grid cell, so the column never changes width on hover |
| `TABLE.rankFace` | One face of that stack, pinned to the shared cell |

## What is enforced

| What | Where | How |
|---|---|---|
| Every text role is unique, and no recipe sets two competing colours | `styles.test.ts` | Uniqueness over `TEXT` and `PROSE`; a resting-colour count over every exported role |
| No component invents a size | `eslint.config.js` | Ban a ramp step or an arbitrary size in a string or template in component sources |
| No component names a hue | `eslint.config.js` | Pattern match on non-slate color utilities, built from alternation so an unlisted one still fails. Component sources are `App.tsx`, `components/` and `map/`, and the self-test lints one hue at a path in each of the last two to prove the glob reaches them |
| No component sizes a tap target | `eslint.config.js` | Ban `touch:` utilities in component sources |
| No component sizes radio/checkbox | `eslint.config.js` | Covered by the hue ban, which reaches `accent-*` |
| No component re-widths a segment | `checks/styles.js` | `style-call-site-classes`: a `w-*` in the template that composes `SEGMENT` |
| No component sets a slate text colour | `eslint.config.js` | Slate is the surface system, already covered by `TEXT`, `SURFACE_*` and `FIELD` |
| No component restates a shared recipe | `eslint.config.js` | Ban the three class lists a role already composes |
| The panel sizes by pointer, not by viewport | `eslint.config.js` | Ban a breakpoint variant on padding, gap or height in `ControlPanel.tsx` and the section files it renders (`PANEL_FILES`) |
| A panel heading takes a role | `eslint.config.js` | Ban a quoted class list on an `h1`-`h3` in the same files |
| The map's edges are one inset | `checks/styles.js`, `styles.test.ts` | `style-map-column` bans a top or left inset at the map's chrome in `App.tsx` and the four map components (`MapLegend`, `LayersPopover`, `MapButtonColumn`, `AnalysisOverlay`); the test does the same for `map.css`, which ESLint does not read |
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
| Every notice renders in one block below Analyze | `checks/styles.js` | A notice is a `NOTICE` role, only `FooterNotice` wears one, and it is rendered exactly once, after the button; the polygon draw counter is the one bare `STATUS` use, pinned by count |
| A disabled control's reason has a hidden twin | `checks/accessibility.js` | Every `aria-describedby` in `LayersPopover.tsx` and `ResultsTableHeader.tsx` matches a `SR_ONLY` element |
| The Layers rows are alphabetical | `styles.test.ts` | The five row labels equal their own sorted order |
| The legend is one box, sorted by what it reads | `styles.test.ts` | One `SURFACE_FLOATING` in the block, every section built by `legendSection`, and the list sorted on `label.localeCompare` — the metric key included, so a `Temperature` ranking sorts last and an `AQI` one first |
| A tick on a strip clears AA | `styles.test.ts` | `RAMP_INK` pins three measurements: white and slate-900 straight onto the ramps, which both fail, and slate-200 on the scrim, which is the one that passes |
| The map column is one width, gap, height and type size | `styles.test.ts`, `checks/styles.js` | `MAP_COL_W`, `MAP_COL_GAP`, `MAP_ROW_H` and `CONTROL_SIZE` composition at every member |
| The control column is derived, not chosen | `styles.test.ts` | `CONTROL_W` equals two `METRIC_BOX_W` plus the grid gap; the picker, chart-select, metric-label and segment-half budgets are summed from measured words |
| No bottom offset is spelled in a component | `checks/app.js` | Ban `bottom-*` in `App.tsx`, `MapLegend.tsx` and `TimelineTransport.tsx`, and `justify-end` / auto margins on the legend stack |
| The accent ratios are pinned | `styles.test.ts` | 4.57, 3.21, 3.04, 3.91 and the 4.02 hover are literals a change must re-measure |
| No component draws its own glyph | `checks/styles.js` | Ban a literal SVG opening tag everywhere under `components/` and `map/` and in `App.tsx`, except `icons.tsx` |
| Nor does the map popup | `checks/styles.js`, `styles.test.ts` | `style-popup-glyph` bans the same tag in `utils/popupChrome.ts`, which builds markup rather than elements; the test pins its glyph size to the `inline` step |
| No call site sizes an icon | `checks/styles.js`, `styles.test.ts` | `style-call-site-classes` bans a height or width utility on any `<Icon…>` element; the test pins the four `ICON` steps by measured pixels, and the key set too |
| Every glyph is hidden from assistive technology | `checks/accessibility.js` | Every SVG in `icons.tsx` and `iconPaths.ts` carries `aria-hidden` |
| No component positions its own panel | `checks/styles.js` | Ban a fixed-position style object and the popover wrapper everywhere under `components/` and `map/` and in `App.tsx`, except `Popover.tsx` |
| One place decides where a panel goes | `checks/styles.js` | `popoverBox` has exactly one caller, the `usePopover` hook |
| No component spells the third divider weight | `styles.test.ts` | Ban the slate-700 border utility everywhere under `components/` and `map/` and in `App.tsx`, and check every `SURFACE_DIVIDER` use carries a side |
| No component fades by a number of its own | `styles.test.ts` | Ban any `opacity-` utility everywhere under `components/` and `map/` and in `App.tsx`; `DISABLED`, `MUTED` and `CARRIED` are the three fades |
| Every exported role is rendered by something | `styles.test.ts` | Each `export const` in `styles.ts` appears in some non-test file's import list under `src/`, or in a `TEST_ONLY` list that carries its reason and is itself checked for a real importer |

**NOT enforced:** custom spacing between components (only recessed surface and controls are architected), component-specific layouts. These are decided per feature.

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
- White on `sky-650` measures **4.57:1** against 4.5:1 WCAG 1.4.3 (text contrast)
- Against the slate-800 panel it reads **3.21:1** against 3:1 WCAG 1.4.11 (UI boundary)
- On `DAY.range` (sky-950 background) it measures **3.04:1** (the binding edge)
- On the segment track it measures **3.91:1**
- The hover state (`sky-600`, white label) is **4.02:1** — deliberate exception, documented below

**Why this shade?** No Tailwind scale step fits. The surviving window for both constraints is 0.0067 of relative luminance wide, and `sky-650` is the midpoint: sky-600 sits above it (white reads 4.02:1) and sky-700 below it (the fill drops to 2.37:1 on the range band, so the ends of a selected range sink into it). Two roads not taken: dark labels clear both constraints with far more room (rejected for brand reasons), and documenting 4.02:1 as a conformance exception was considered (rejected: 4.02 is below AA, and the resting state is the one a reader looks at, so the custom shade lifts it to 4.57 and leaves only the hover short). The hover at 4.02:1 is kept because with a white label every lightening costs contrast — a conformant hover would have to darken, making the app's primary action the only control that dims on pointer-over.

**Re-measure condition:** if `DAY.range` ever changes, re-derive this shade. The binding edge is `DAY.range` at 3.04:1, so the selected day must still be findable against the range band beside it.

### The three weights of rule

Measured against the slate-800 panel and card, which is what every one of them
is drawn on except the calendar's own well:

| Role | Colour | Contrast | Who places it |
|---|---|---|---|
| `PANEL_EDGE` | slate-500 | 3.07:1 | The call site |
| `PANEL_RULE` | slate-600 at half opacity | 1.37:1 | The panel's stack |
| `SURFACE_DIVIDER` | slate-700 | 1.41:1 | The call site |

Only the first is meant to be seen as a boundary, and it is the one step that
clears the 3:1 a UI boundary owes. The other two are the same quiet line to the
eye: half-opacity slate-600 composites to (50.5, 63, 82) on the panel where
slate-700 is (51, 65, 85). They are two roles rather than one because they
differ in who decides WHERE the line goes, not in what it looks like:
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

**No indent:** the messages under the Analyze button are stacked rows
separated by a 1px rule (`NOTICE_DIVIDER`), never a bulleted list. The
budget above is measured with the whole text column, and a list indent
plus its marker take 16px of it — enough to wrap a line that fit on its
own before a second message joined it.

**The dismiss X costs the column 20px, not 44:** on a coarse pointer the
target is 44px and the disc is 20, and the difference reaches back over
the tail of the text (`touch:-ml-6` on `NOTICE_DISMISS.button`) rather
than out of the column. Nothing moves on screen. Measured at 402px with
the panel at 360: the column is 281px, where the longest commit cue
("A new destination type requires a new analysis.") needs 267.3px.

**Line allowance:** messages in the panel body hold to one line. The area
below the Analyze button — blockers, commit cues, refusals, provider
errors, and the warnings that qualify a report — may run to two lines,
because that is where the app explains why it will not or could not act
and a truncated reason is worse than a second line.

### Results bar fold point

The results bar is one line when its container is 896px or wider, and two lines below that: the title row (ranking summary, window, collapse chevron) and the actions row (mode switch, Columns, Models, Removed, Download CSV, Open-Meteo.com). The column never stacks further, but the actions row itself wraps on a narrow phone: measured at 402px on a coarse pointer, the mode switch at its 44px height and the five links do not fit one row of the 378px available, so the last of them fold under. That makes the bar 103.5px tall there, which `SHEET_HEADER_PX` in `frontend/src/utils/resultsSheet.ts` rounds up to 104 — re-measure both together.

The five links read at `TEXT.control`, the size of every other control in the app. They are buttons the reader presses; the micro step is for text that is present but never first.

The mode switch wears `SEGMENT_FLUID`, not `SEGMENT`: the panel's segment role bakes in the sidebar's column, which three icon-plus-label halves cannot fit — that mismatch is how the switch once shipped clipped by its own `overflow-hidden`.

### Control width

Every stacked panel control composes `CONTROL_W = 'w-[118px]'` = 118px.

- The label takes the free space (flex-grow)
- The control takes `CONTROL_W`
- Both share a baseline in a flex row

118px is not a taste. It is 2 x `METRIC_BOX_W` + the Metrics grid's `gap-x-1.5`, so the Forecast section's model picker and its two segments stand on exactly the edges the bound boxes below them do. The panel is one column at 225 and 343, measured. It was 144px, set by the widest segment label, until the Metrics row's label budget forced the narrower boxes and left the two sections 26px apart. `styles.test.ts` derives the sum from the roles.

The Metrics table still sizes nothing by that token. Its row is the panel's widest — radio, label, aggregate dropdown (`SELECT_W_AGGREGATE`, 72px), Min box and Max box (`METRIC_BOX_W`, 56px each) — and the label has to hold `Freezing level` at text-xs inside the panel's 327px of content. The direction segment above the rows spans the two box columns and wears `SEGMENT_FILL`, because a fixed width in a grid cell states a number the tracks already decide.

Four controls in that section share one pair of edges: the direction segment, the results cap box, the Clear filters button, and every bound pair. The three wide ones span the two box columns rather than spelling their sum, so the width lives in `METRIC_BOX_W` alone. Clear filters is always drawn and disables when there is nothing to clear, so the section's last row never moves.

Nothing is drawn between the section's two blocks. `METRIC_HEAD_GAP` is the whole separation: 8px of padding above the heading row, which is what tells the two controls that order the list from the table of bounds under them.

**Segment arithmetic:** 118px less the 2px border and the 1px divider is 57.5px a half. The longest words are `Highest` at 43.69px and `Current` at 42.89px, both at text-xs, so `SEGMENT_ITEM` carries a 4px inset leaving 49.5px. An 8px inset leaves 41.5px and clips them both, which is why there is one inset for every segment in the panel rather than two. Checked in `styles.test.ts`.

**The select arrow:** `SELECT` reserves `pr-6` = 24px, which is the arrow's own box and nothing more — `ICON_ADORNMENT` puts a 16px glyph 8px from the edge. It reserved 32px until the column came down to 118px, where those 8px were the difference between `UK Met Office` (79.69px) fitting the model picker's 84px of label and truncating. `Meteo-France ARPEGE` at 130.03px fits no trigger the panel can offer and truncated at 144px too.

**Arithmetic:** `327 − 14 (radio) − 10 (label gap) − 3 × 6 (grid gaps) − 72 − 2 × 56 = 101px` for the label. The noun's measured width is pinned beside that sum in `styles.test.ts`; re-measure before moving a width, the gap, or the nouns.

### Welcome dialog height

The welcome dialog is a `max-w-md` card on a `p-4` backdrop, so it is 448px wide at a desktop width and 328px wide on a 360px phone, where the copy wraps further. Measured 2026-09-16 in Chrome 153 on macOS, against the built bundle.

- The card's content column is **857px** tall at 448px wide and **1065px** tall at 328px wide. That is the 821 and 1029 measured above plus the **36px** the `Take the tutorial` button added (#536), measured 2026-09-24 in Playwright's Chromium on Linux by removing the button from the rendered card at both widths; the difference, not the total, is what carries between the two browsers' fonts
- The backdrop's padding and the card's border take 34px of the window, so a card that does not scroll needs **891px** of viewport height at a desktop width and **1099px** at a phone width
- The dialog has neither: a 768px-tall desktop viewport leaves it 734px and a 360 x 640 phone leaves it 606px, so it scrolls at both

**There is no no-scroll budget to spend.** `max-h-full overflow-y-auto` is what the card wears instead, so the dialog is read by scrolling rather than at a glance. That is why the third step covers the whole Metrics table in one line rather than a step per question: another step lengthens a card the reader already scrolls. `WelcomeModal.tsx` points here for these numbers.

**Re-measure condition:** a new step, a new button, a change to the `PROSE` sizes the card is set in, or copy that adds a line to any step. The binding case is the phone: the desktop column is 208px shorter.

## Tailwind v4 facts

**Color resolution:** competing color utilities resolve by their order in the generated stylesheet, not their order in the class list. So a role's color cannot be overridden at a call site — the role always wins. This is why every hue is centralized: a component cannot brighten or dim a color it was handed.

**Raw text scanning:** the build step scans source files as raw text to find class names, so a class quoted in a comment or a test emits its CSS. For example, writing `// don't use rounded-xl` in a component file would add `rounded-xl` to the bundle even though it's commented out. The lints and role definitions avoid this by building patterns that don't form the literal class name — e.g., using regex alternation instead of quoting the exact string. The `content` list in `tailwind.config.js` is not the whole scanned set: v4 auto-detects sources beside it, and `frontend/tools/` was being scanned until `@source not "../tools"` went into `src/index.css`. Measured on 2026-09-15: without that line the ESLint fixtures emitted five real utilities into the text-page bundle, and a stray `.lowercase` had already been leaking from `tools/` before they existed. That exclusion is what lets the ESLint rules spell a class where `styles.test.ts` may not, and `styles.test.ts` pins the line.

**Vendor stylesheets go in a layer:** utilities live in `@layer utilities`, and unlayered CSS outranks every layer whatever its specificity. So MapLibre's stylesheet (`map.css`) and Driver.js's (`tour.css`) are each imported inside `layer(base)`, which is what lets a role's utilities restyle what those libraries draw. A vendor rule that must beat a vendor rule, like hiding Driver's arrow, is written unlayered in the same file.

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
- The Hourly segment, the smoke legend's density chips, and the table's
  **Wildfire (mi)** cell, each documented where it is used.

Every one of them is counted in `styles.test.ts`, which fails an unapproved
addition and an accidental deletion alike.

**A tooltip that carries a reason carries it twice.** Where the sentence is the
only thing explaining a state, the same text is also mounted in a visually hidden
element that `aria-describedby` names (`SR_ONLY` in `styles.ts`), because the
touch argument above applies to a screen reader as well: a `title` is a pointer's
affordance and is not promised to anything else. The linter's
`disabled-reason-twin` check fails an `aria-describedby` in `LayersPopover.tsx`
or `ResultsTableHeader.tsx` with no `SR_ONLY` twin.

### Sentence case

All UI copy is sentence case (capitalize first word and proper nouns only). Acronyms keep capitals: "AQI", "OSM".

### Error messages and remedies

Errors end with period and a standing sentence: `Try again later.` This has two exceptions:

- Parse failures carry no remedy tail (e.g., "Invalid coordinate format.")
- Model coverage messages name the remedy (e.g., "{model} has no forecast coverage for this area. Switch to a different model and try again.")

Remedies only work where they work. A generic "try again" for a network error does not help if the network is down. Failing that test, omit the remedy and show only the state.

The over-cap refusal states the problem only ("This search covers N peaks. The analysis limit is M destinations."). Its machine-readable remedies live in the API's structured fields, never in the prose (TJ, 2026-08-22).

### Every message is a box

There is no unboxed message. Every line under the Analyze button is one of the
three `NOTICE` boxes, and severity is the only thing that varies. A `CUE` role once held a centred, borderless
variant for the commit cues, and the footer showed a cue in amber text directly
above a blocker in an amber box, saying the same kind of thing in two shapes.
The one bare `STATUS` text left in the panel is the polygon's draw counter,
which is a field's own readout beside the field rather than a message about the
analysis; the linter's `style-draw-counter` check pins it by count.

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
the wind scale's cyan-300 and slate-900 measures 2.04:1 on its purple, and every
metric ramp and all eleven snow bands have an end like each of those. So the
numbers sit on a `bg-slate-900/70` band along the strip's bottom edge, where
slate-200 measures **6.49:1** against the worst band under it. A text shadow was
the alternative and is not measurable, which is the whole reason this one is
pinned in `styles.test.ts` as `RAMP_INK` — change the ramp colours or the scrim's
opacity and the number has to be taken again.

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
by both `icons.tsx` and `utils/popupChrome.ts` (#435). That module carries the
geometry, the stroke, and the one size a string has to spell; the linter's
`style-popup-glyph` check bans a literal SVG tag in `popupChrome.ts`, and
`styles.test.ts` pins that size to the `inline` step. It sits at `src/` rather than in `components/`, beside `styles.ts` and
`metrics.ts`, because `popupChrome.ts` is a util and no util in the app imports
a component.

### Opening a panel

Every floating panel that hangs off a control is one shell and one hook (#385):
`components/Popover.tsx` draws the card, and `hooks/usePopover.ts` decides where
it goes and what closes it. A component supplies its rows and nothing else.

The shell owns four decisions the four pickers each used to make for
themselves: the `SURFACE_CARD` wrapper, `LAYER.popover`, the fixed box, and the
portal to `document.body`. Fixed and portalled because the control panel is an
`overflow-y-auto` column: a panel rendered inside it is clipped at the scroll
boundary, which for a control near the bottom cuts the list in half. It also
draws the overline header row, which two of the four had spelled separately.

The linter fails a second `position: 'fixed'` or a second copy of that wrapper
anywhere under `components/` (`style-own-popover`), and a second caller of
`popoverBox` (`style-one-placement`).

### Adding a new role

1. Write the role in `styles.ts` with a rationale comment explaining what it is for
2. Add an assertion in `styles.test.ts` that pins the role's properties (size, color, weight, etc.)
3. Ship both in the same PR

A ban on a call site is the other file: a rule that a pattern over class names
can decide belongs in `eslint.config.js`, not in a test.

The assertion is what makes a change to a role visible in code review rather than buried in a stylesheet.
