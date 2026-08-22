# Design System

Bluebird's frontend design lives in `frontend/src/styles.ts`, which exports the roles every component composes. This page documents what each role is for, what is enforced, and the measured numbers that keep the app consistent.

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
| `CHOICE_ROW` | Radio or checkbox and its label as one strip |
| `CHOICE_INPUT` | The box itself inside a choice row |
| `SEGMENT` | Geometry of a panel segmented control (fixed to `CONTROL_W`) |
| `SEGMENT_FLUID` | Segmented control outside the panel column, sized by content |
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
| `NOTICE_DISMISS` | The X that dismisses an event notice (error or refusal); derived warnings get none |

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
| `BOUNDS_GRID` | Forecast bounds grid layout with label + two boxes |

**Map timeline**

| Role | Purpose |
|---|---|
| `SCRUBBER` | The timeline's `<input type="range">`: suppresses the platform slider on every engine that draws one, and draws the thumb |
| `SCRUBBER_TRACK` | The rail behind it, on the same recessed surface as every other well |

**Layers**

| Role | Purpose |
|---|---|
| `LAYER.base` | Map chrome, sticky header, docked panels |
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

## What is enforced

| What | Where | How |
|---|---|---|
| Every role is unique | `styles.test.ts` | Assertion per role group (TEXT, PROSE, etc.) |
| No component invents a size | `styles.test.ts` | Ban `text-[` utilities in component sources |
| No component names a hue | `styles.test.ts` | Pattern match on non-slate color utilities |
| No component sizes a tap target | `styles.test.ts` | Ban `touch:` utilities in component sources |
| No component sizes radio/checkbox | `styles.test.ts` | Ban `accent-sky-500` duplication |
| No component re-widths a segment | `styles.test.ts` | Check for `w-*` inside `SEGMENT` composition |
| No component dims a placeholder | `styles.test.ts` | Ban placeholder utilities below AA contrast |
| Every radio/checkbox uses the shared recipe | `styles.test.ts` | Check `CHOICE_INPUT` composition |
| Every focus-able control has focus ring | `styles.test.ts` | List per control type |
| Segmented controls are built one way | `styles.test.ts` | Check `SEGMENT` / `SEGMENT_IDLE` / `SEGMENT_ITEM` composition |
| Metric names are centralized | `metrics.test.ts` | Ban Precip/Temp/Avg/Min/Max/Elev abbreviations in nine files |
| No `title=` attributes on JSX elements | `styles.test.ts` | Regex pattern on component sources |
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

**Line allowance:** messages in the panel body hold to one line. The area
below the Analyze button — blockers, commit cues, refusals, provider
errors, and the warnings that qualify a report — may run to two lines,
because that is where the app explains why it will not or could not act
and a truncated reason is worse than a second line.

### Results bar fold point

The results bar is one line when its container is 896px or wider, and exactly two lines below that: the title row (ranking summary, window, collapse chevron) and the actions row (mode switch, Columns, Download CSV, Open-Meteo.com). It never stacks further.

The mode switch wears `SEGMENT_FLUID`, not `SEGMENT`: the panel's segment role bakes in the sidebar's 144px column, which three icon-plus-label halves cannot fit — that mismatch is how the switch once shipped clipped by its own `overflow-hidden`.

### Control width

Every stacked panel control composes `CONTROL_W = 'w-36'` = 144px.

- The label takes the free space (flex-grow)
- The control takes `CONTROL_W`
- Both share a baseline in a flex row

The bounds grid (two bounds boxes + label) derives from this: two boxes at 4.25rem (68px) each plus a 0.5rem (8px) gap = 144px total.

**Arithmetic:** `4.25 + 4.25 + 0.5 = 9`, and `9 × 16px / 4 = 144px` (Tailwind's scale is quarter-rem). Checked in `styles.test.ts`.

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

The one in the tree today: the filter grid's *"Destinations with unknown values
are included."* rides as a `title` on the Elevation and AQI rows — the two whose
value can genuinely be missing — rather than as a standing line under the grid.
That bought back the line of height that made the panel scroll, and the fact
stays discoverable in the table (a dash) and in `docs/DATA.md`.

### Sentence case

All UI copy is sentence case (capitalize first word and proper nouns only). Acronyms keep capitals: "AQI", "OSM".

### Error messages and remedies

Errors end with period and a standing sentence: `Try again later.` This has two exceptions:

- Parse failures carry no remedy tail (e.g., "Invalid coordinate format.")
- Model coverage messages name the remedy (e.g., "{model} has no forecast coverage for this area. Switch to a different model and try again.")

Remedies only work where they work. A generic "try again" for a network error does not help if the network is down. Failing that test, omit the remedy and show only the state.

### Boxed vs. unboxed messages

- **Boxed** = about the analysis (what you asked for, what came back)
- **Unboxed** = about the controls (what you can do to fix it)

### No raw exceptions or status

Never surface an exception type or HTTP status directly. Write a sentence instead.

### Model coverage message

The one message mirrored between backend and frontend: "{label} has no forecast coverage for this area. Switch to a different model and try again." Defined in `backend/app/services/weather.py` and ported to `frontend/src/utils/openMeteo.ts` and `frontend/src/hooks/useAnalyze.ts`.

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
