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
| `TEXT.overline` | Tiny all-caps labels: legend metrics, search result kinds |
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
| `SURFACE_CARD` | Opaque cards above a scrim: dialogs, analysis overlay |
| `SURFACE_FLOATING` | Boxes floating over the map: search field, legends, chart tooltip, the forecast player's transport bar |
| `RECESSED_FILL` / `RECESSED_EDGE` | The well every recessed surface composes: slate-900 fill and a slate-500 border, which clears 3:1 against the panel. Fields, selects, segments and the legends all start here |
| `SURFACE_POPOVER` | A floating box that is a menu rather than a key: the map's Layers popover and the search result list, lifted off the legends by one step of fill and a heavier shadow |
| `SURFACE_SHEET` | The results on a phone, standing on the map's bottom edge: the docked panel's fill, the map's floating edge, the surface radius on the top corners only |
| `SURFACE_GROUP` | Bordered region grouping controls: the calendar |
| `SURFACE_GROUP_BLEED` | Cancels a well's inset so its contents sit on the panel's control column |

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
| `CAPTION_LIFTED` | `TEXT.caption` re-derived for `SURFACE_POPOVER`: a search result's description, slate-300 because slate-400 falls under 4.5:1 on that fill |
| `SLIDER_OVERLAY` / `SLIDER_VALUE` / `SLIDER_WORDMARK` / `SLIDER_IDLE` | The coverage slider in the Layers popover: the transparent range input laid over the drawn track, the value readout at `CONTROL_SIZE`, the in-track wordmark at the same size in sentence case, and the idle tint |
| `PANEL_EDGE` / `PANEL_RULE` | The panel's own border tint, and the rule between the panel's sections, drawn from the stack so a section added later cannot forget its line |
| `BADGE_STEP` | The step-number badge in the welcome modal, derived from `ACCENT.fill` |
| `SWATCH_CHIP` | A legend swatch that carries a letter: the smoke legend's three density chips, side by side so the opacity ramp reads against itself |

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
| `MAP_COL_W` | Width of everything in the map's left column but one: the search field, the Controls and Layers buttons, the Layers popover and both legends. 184px (w-46), governed within a pixel by two rows, the grid legend's wait line (176.8px) and the search field at rest (177.6px). The exception is the search RESULT list, deliberately wider (w-72/w-80): bound to the column it clipped the county and state that tell four places of one name apart |
| `MAP_ROW_H` | Height of one row in that column: 36px, floored at 44px on a finger. Fixed, because the search field and the two buttons each solved for their own height and came out 34, 38 and 38 |
| `MAP_COL_GAP` | The gap between members of that column: 4px, half the 8px they took before. A role rather than four call sites, because `LEGEND_TOP`'s arithmetic is built from it. `MAP_COL_GAP_T` is the same gap as a top margin, for a popover that hangs rather than sits |
| `LEGEND_TOP` | Where the legend stack hangs under that column, in four numbers: two pointer sizes, each with and without the Controls button, which stands in the column only while the panel is collapsed. `resultsSheet.ts` mirrors two of them as `LEGEND_TOP_PX` and `LEGEND_TOP_FINE_PX`, and `resultsSheet.test.ts` reads `styles.ts` as text to hold the pairs together |
| `MAP_EDGE` | How far anything floating on the map stands off its edge: 12px, published once as `--map-edge-inset` on the map wrapper and read by the button column, the legend stack and MapLibre's own control stack. The same publisher carries `--map-credit-size` at `MICRO_PX`, so `map.css` can size the library's credit line from the ramp |
| `MICRO_PX` / `MICRO_SIZE` | The ramp's smallest step as a number (10) and as a utility, for the one line the library draws and the app cannot class |
| `METRICS_GRID` | The Metrics table: label, aggregate dropdown, Min box, Max box; the control columns are `auto`, sized by the roles their controls wear |
| `METRIC_BOX_W` | One bound box in the Metrics table: 56px (w-14), the widest the metric row's label budget allows. The results cap spans both box columns instead, so it wears `w-full` off the same shape |
| `METRIC_HEAD_GAP` | The Metrics table's one deliberate break: 8px (pt-2) above the two box headings, on every cell of that row because the columns are grid tracks. The only vertical space in the grid that `gap-y` does not set |

**Moving a column**

One set of roles for both surfaces that reorder columns, the table header and the Columns picker, so a gesture that means "this moves" looks the same in either.

| Role | Purpose |
|---|---|
| `DRAG_GRIP` | The handle itself. `cursor-grab` is the standing signal; `touch-none` is load-bearing, because without it the browser claims the gesture for scrolling and the drag never gets a second pointer event on a phone |
| `DRAG_GRIP_ACTIVE` | The grip while its own column is the one being carried |
| `DRAG_TARGET` | The column a drop would land on |
| `DRAG_GHOST` | The column riding under the pointer. Portalled to the body and positioned in viewport coordinates, so it takes the app's top layer rather than the table's; `pointer-events-none` is load-bearing, or the ghost is what every hit test finds |
| `DRAG_INSERT` | The bar marking the gap the column will drop into. The accent's fill without its label color, since the bar carries no text |

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
| `ICON` | How big a drawn glyph is, in five steps: `control` 16, `search` 15, `inline` 14, `legend` 12, `micro` 10. Read only by `components/icons.tsx`, which draws every icon in the app |
| `ICON_BUTTON` | Bare icon button in header |
| `ICON_ACTION` | Icon that acts on hover |
| `ICON_ADORNMENT` | Glyph drawn inside a field |
| `SPINNER` | Indeterminate spinner |
| `TABLE.cell` | Results table cell inset |
| `TABLE.head` | Results table header cell |
| `TABLE.rankStack` | Rank cell: number and remove × in one grid cell, so the column never changes width on hover |
| `TABLE.rankFace` | One face of that stack, pinned to the shared cell |

## What is enforced

| What | Where | How |
|---|---|---|
| Every text role is unique, and no recipe sets two competing colours | `styles.test.ts` | Uniqueness over `TEXT` and `PROSE`; a resting-colour count over every exported role |
| No component invents a size | `styles.test.ts` | Ban `text-[` utilities in component sources |
| No component names a hue | `styles.test.ts` | Pattern match on non-slate color utilities |
| No component sizes a tap target | `styles.test.ts` | Ban `touch:` utilities in component sources |
| No component sizes radio/checkbox | `styles.test.ts` | Ban `accent-sky-500` duplication |
| No component re-widths a segment | `styles.test.ts` | Check for `w-*` inside `SEGMENT` composition |
| The map's edges are one inset | `styles.test.ts` | Ban a top or left inset at the map's chrome, in `App.tsx` and `map.css` alike |
| No component dims a placeholder | `styles.test.ts` | Ban placeholder utilities below AA contrast |
| Every radio/checkbox uses the shared recipe | `styles.test.ts` | Check `CHOICE_INPUT` composition |
| Every focus-able control has focus ring | `styles.test.ts` | List per control type |
| Segmented controls are built one way | `styles.test.ts` | Check `SEGMENT` / `SEGMENT_IDLE` / `SEGMENT_ITEM` composition |
| Metric names are centralized | `metrics.test.ts` | Ban Precip/Temp/Avg/Min/Max/Elev abbreviations in twelve consumer files |
| Tooltips match the approved list, count for count | `styles.test.ts` | `title=` occurrences per component file |
| No unsafe error message patterns | `metrics.test.ts` | Ban `failed: ${...}` and unsafe response copies |
| Every radius is on the scale | `styles.test.ts` | Any `rounded*` in a component source must be a `RADIUS` value |
| Every notice renders in one block below Analyze | `styles.test.ts` | A notice is a `NOTICE` role, only `FooterNotice` wears one, and it is rendered exactly once, after the button; the polygon draw counter is the one bare `STATUS` use, pinned by count |
| A disabled control's reason has a hidden twin | `accessibility.test.ts` | Every `aria-describedby` in `App.tsx` matches a `SR_ONLY` element |
| The Layers rows are alphabetical | `styles.test.ts` | The five row labels equal their own sorted order |
| The map column is one width, gap, height and type size | `styles.test.ts` | `MAP_COL_W`, `MAP_COL_GAP`, `MAP_ROW_H` and `CONTROL_SIZE` composition at every member |
| The control column is derived, not chosen | `styles.test.ts` | `CONTROL_W` equals two `METRIC_BOX_W` plus the grid gap; the picker, chart-select, metric-label and segment-half budgets are summed from measured words |
| No bottom offset is spelled in a component | `resultsSheet.test.ts` | Ban `bottom-*` in `App.tsx` and `TimelineTransport.tsx`, and `justify-end` / auto margins on the legend stack |
| The accent ratios are pinned | `styles.test.ts` | 4.57, 3.21, 3.04, 3.91 and the 4.02 hover are literals a change must re-measure |
| No component draws its own glyph | `styles.test.ts` | Ban a literal SVG opening tag everywhere under `components/` and in `App.tsx`, except `icons.tsx` |
| Nor does the map popup | `styles.test.ts` | Ban the same tag in `utils/popupChrome.ts`, which builds markup rather than elements, and pin its glyph size to the `inline` step |
| No call site sizes an icon | `styles.test.ts` | Ban a height or width utility on any `<Icon…>` element; the five `ICON` steps are pinned by measured pixels |
| Every glyph is hidden from assistive technology | `accessibility.test.ts` | Every SVG in `icons.tsx` and `iconPaths.ts` carries `aria-hidden` |

**NOT enforced:** custom spacing between components (only recessed surface and controls are architected), component-specific layouts. These are decided per feature.

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

## Tailwind v4 facts

**Color resolution:** competing color utilities resolve by their order in the generated stylesheet, not their order in the class list. So a role's color cannot be overridden at a call site — the role always wins. This is why every hue is centralized: a component cannot brighten or dim a color it was handed.

**Raw text scanning:** the build step scans source files as raw text to find class names, so a class quoted in a comment or a test emits its CSS. For example, writing `// don't use rounded-xl` in a component file would add `rounded-xl` to the bundle even though it's commented out. The lints and role definitions avoid this by building patterns that don't form the literal class name — e.g., using regex alternation instead of quoting the exact string.

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
affordance and is not promised to anything else. `accessibility.test.ts` fails an
`aria-describedby` in `App.tsx` with no `SR_ONLY` twin.

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
analysis; `styles.test.ts` pins it by count.

### No raw exceptions or status

Never surface an exception type or HTTP status directly. Write a sentence instead.

### Where the data hues live

The no-hue lint scans `components/` and `App.tsx`. The app's data colours, the
band ramps a marker, a grid cell and the legend all read, are `METRIC_SCALE` in
`frontend/src/utils/colors.ts`, one scale per metric family, the freezing level
included since #295 was reversed (2026-09-14). That file is the one place
outside `styles.ts` allowed to name a hue, because a band's colour is what the
number means rather than what the surface is.

### Model coverage message

The one message mirrored between backend and frontend: "{label} has no forecast coverage for this area. Switch to a different model and try again." Defined in `backend/app/services/weather.py` and ported to `frontend/src/hooks/useAnalyze.ts`. The `OpenMeteoModelCoverage` error in `frontend/src/utils/openMeteo.ts` is developer-facing, names the model id, and is not a copy of it.

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
  `className`. Never a size: a height or width handed to an icon fails
  `styles.test.ts`.

To add one, write the component in that file, give it a step from the `ICON`
ramp, and let it set `aria-hidden` itself. A step that does not exist yet is a
new role: add it to `ICON` with its rationale and pin its pixels in
`styles.test.ts`, the same way as below.

**The one glyph drawn twice.** A map popup is an HTML string handed to
MapLibre's `setHTML`, so Tailwind never sees its class names and the icon
module cannot draw it. The link-out arrow in a popup's title row is therefore
the same shape as the results table's, read from `frontend/src/iconPaths.ts`
by both `icons.tsx` and `utils/popupChrome.ts` (#435). That module carries the
geometry, the stroke, and the one size a string has to spell; `styles.test.ts`
bans a literal SVG tag in `popupChrome.ts` and pins that size to the `inline`
step. It sits at `src/` rather than in `components/`, beside `styles.ts` and
`metrics.ts`, because `popupChrome.ts` is a util and no util in the app imports
a component.

### Adding a new role

1. Write the role in `styles.ts` with a rationale comment explaining what it is for
2. Add an assertion in `styles.test.ts` that pins the role's properties (size, color, weight, etc.)
3. Ship both in the same PR

The assertion is what makes a change to a role visible in code review rather than buried in a stylesheet.
