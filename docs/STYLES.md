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
| `SURFACE_FLOATING` | Boxes floating over the map: search field, legends, chart tooltip |
| `SURFACE_POPOVER` | The map's Layers popover: the floating box that is a menu rather than a key, lifted off the legends by one step of fill and a heavier shadow |
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
| `BUTTON_FLOATING` | Pressable floating box: reopen controls button |

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
| `CUE` | Unboxed status line: commit-needed messages |

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
| `CHIP.remove` | The x that deselects it: 24px square, WCAG 2.5.8's AA floor, on every pointer |

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
| `CONTROL_W` | Single stacked panel control width: 144px (w-36) |
| `MAP_BOX_W` | Width of every floating box under the Layers button: the popover and both legends, 192px (w-48), governed by the grid legend's longest row |
| `MAP_EDGE` | How far anything floating on the map stands off its edge: 12px, published once as `--map-edge-inset` on the map wrapper and read by the button column, the legend stack and MapLibre's own control stack |
| `METRICS_GRID` | The Metrics table: label, aggregate dropdown, Min box, Max box; the control columns are `auto`, sized by the roles their controls wear |
| `METRIC_BOX_W` | One bound box in the Metrics table: 56px (w-14), the widest the metric row's label budget allows. The results cap spans both box columns instead, so it wears `w-full` off the same shape |
| `SEGMENT_ITEM_TIGHT` | One half of a `SEGMENT_FILL`: the 4px inset a 118px segment can afford |
| `SECTION_SEAM` | A rule INSIDE a section, grouping its rows: `slate-700/50`, fainter than `PANEL_RULE` on both the slate step and the alpha, because `PANEL_RULE`'s `slate-600/50` already composites to about solid `slate-700` |

**Map timeline**

| Role | Purpose |
|---|---|
| `SCRUBBER` | The timeline's `<input type="range">`: suppresses the platform slider on every engine that draws one, and draws the thumb |
| `SCRUBBER_TRACK` | The rail behind it, on the same recessed surface as every other well |
| `TRANSPORT_AXIS_ITEM` | The axis switch's halves: `SEGMENT_ITEM` with one step more inset, because the right half carries a ranked metric's noun rather than a word the app chose |

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
| `ICON` | Inline SVG icon sizing: 16x16 |
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
| Every role is unique | `styles.test.ts` | Assertion per role group (TEXT, PROSE, etc.) |
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
| Metric names are centralized | `metrics.test.ts` | Ban Precip/Temp/Avg/Min/Max/Elev abbreviations in nine files |
| Tooltips match the approved list, count for count | `styles.test.ts` | `title=` occurrences per component file |
| No unsafe error message patterns | `styles.test.ts` & `metrics.test.ts` | Ban `failed: ${...}` and unsafe response copies |

**NOT enforced:** custom radius, custom spacing between components (only recessed surface and controls are architected), component-specific layouts. These are decided per feature.

## Measured numbers

### The accent fill custom shade

The accent appears in six places and must pass WCAG AA on all of them. On a white-on-blue design, those constraints are tight.

- `--color-sky-650` is defined in `frontend/src/index.css` and used throughout as the custom token
- White on `sky-650` measures **4.57:1** against 4.5:1 WCAG 1.4.3 (text contrast)
- Against the slate-800 panel it reads **3.21:1** against 3:1 WCAG 1.4.11 (UI boundary)
- On `DAY.range` (sky-950 background) it measures **3.04:1** (the binding edge)
- On the segment track it measures **3.91:1**
- The hover state (`sky-600`, white label) is **4.02:1** — deliberate exception, documented below

**Why this shade?** No Tailwind scale step fits. The surviving window for both constraints is 0.0067 of relative luminance wide, and `sky-650` is the midpoint. Two roads not taken: dark labels clear both constraints with far more room (rejected for brand reasons), and documenting 4.02:1 as a conformance exception was considered (rejected because 4.02 is no longer below AA at the resting state). The hover at 4.02:1 is kept because with a white label every lightening costs contrast — a conformant hover would have to darken, making the app's primary action the only control that dims on pointer-over.

**Re-measure condition:** if `DAY.range` ever changes, re-derive this shade. The binding edge is `DAY.range` at 3.04:1, so the selected day must still be findable against the range band beside it.

### Copy length budget

The panel is 360px on desktop (100vw − 2rem capped at 360 on phones).

- Boxed status messages: ~47 characters per line (floor of 360px minus padding and margins)
- Unboxed status messages: ~50 characters per line (narrower because bare, not in a box)
- Assumption: English; other languages will be tighter

**Binding condition:** a 360px phone with English copy. If copy reaches ~47 chars without wrapping, it fits one line.

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

The results bar is one line when its container is 896px or wider, and two lines below that: the title row (ranking summary, window, collapse chevron) and the actions row (mode switch, Columns, Download CSV, Open-Meteo.com). The column never stacks further, but the actions row itself wraps on a narrow phone: measured at 402px on a coarse pointer, the mode switch takes 136px of the 378px available and the three links need 232px more with their gaps, so the last of them folds under. That makes the bar 102.5px tall there, which `SHEET_HEADER_PX` in `frontend/src/utils/resultsSheet.ts` mirrors — re-measure both together.

The three links read at `TEXT.control`, the size of every other control in the app. They are buttons the reader presses; the micro step is for text that is present but never first.

The mode switch wears `SEGMENT_FLUID`, not `SEGMENT`: the panel's segment role bakes in the sidebar's 144px column, which three icon-plus-label halves cannot fit — that mismatch is how the switch once shipped clipped by its own `overflow-hidden`.

### Control width

Every stacked panel control composes `CONTROL_W = 'w-36'` = 144px.

- The label takes the free space (flex-grow)
- The control takes `CONTROL_W`
- Both share a baseline in a flex row

The Metrics table is the one section that uses none of it. Its row is the panel's widest — radio, label, aggregate dropdown (`SELECT_W_AGGREGATE`, 72px), Min box and Max box (`METRIC_BOX_W`, 56px each) — and the label has to hold `Freezing level` at text-xs inside the panel's 327px of content. The direction segment above the rows spans the two box columns and wears `SEGMENT_FILL`, so every control in the section shares the boxes' two edges rather than the sidebar's.

Four controls in that section share one pair of edges: the direction segment, the results cap box, the Clear filters button, and every bound pair. The three wide ones span the two box columns rather than spelling their sum, so the width lives in `METRIC_BOX_W` alone.

**Segment arithmetic:** 2 x 56px + the 6px grid gap = 118px, less the 2px border and the 1px divider, is 57.5px a half. `Highest` measures 43.69px at text-xs, so the halves wear `SEGMENT_ITEM_TIGHT` (4px) and not `SEGMENT_ITEM` (8px, which leaves 41.5px and clips the word). Checked in `styles.test.ts`.

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

- The filter grid's *"Destinations with unknown values are included."* rides as a
  `title` on the Elevation and AQI rows — the two whose value can genuinely be
  missing — rather than as a standing line under the grid. That bought back the
  line of height that made the panel scroll, and the fact stays discoverable in
  the table (a dash) and in `docs/DATA.md`.
- Two disabled controls say why they are disabled: the model picker over an
  archive window, and the Forecast grid row over a report carrying archive hours
  (#123). A disabled control says that it cannot be used and never why, and
  neither reason can be read off the panel.
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
affordance and is not promised to anything else.

### Sentence case

All UI copy is sentence case (capitalize first word and proper nouns only). Acronyms keep capitals: "AQI", "OSM".

### Error messages and remedies

Errors end with period and a standing sentence: `Try again later.` This has two exceptions:

- Parse failures carry no remedy tail (e.g., "Invalid coordinate format.")
- Model coverage messages name the remedy (e.g., "{model} has no forecast coverage for this area. Switch to a different model and try again.")

Remedies only work where they work. A generic "try again" for a network error does not help if the network is down. Failing that test, omit the remedy and show only the state.

The over-cap refusal states the problem only ("This search covers N peaks. The analysis limit is M destinations."). Its machine-readable remedies live in the API's structured fields, never in the prose (TJ, 2026-08-22).

### Boxed vs. unboxed messages

- **Boxed** = about the analysis (what you asked for, what came back)
- **Unboxed** = about the controls (what you can do to fix it)

### No raw exceptions or status

Never surface an exception type or HTTP status directly. Write a sentence instead.

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

### Adding a new role

1. Write the role in `styles.ts` with a rationale comment explaining what it is for
2. Add an assertion in `styles.test.ts` that pins the role's properties (size, color, weight, etc.)
3. Ship both in the same PR

The assertion is what makes a change to a role visible in code review rather than buried in a stylesheet.
