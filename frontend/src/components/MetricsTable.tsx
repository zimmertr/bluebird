import { Fragment, useEffect, useRef, useState } from 'react'
import { SortBy } from '../types'
import {
  ACCENT,
  BUTTON_SECONDARY,
  DISABLED,
  FIELD_NUMERIC,
  ICON_ADORNMENT,
  METRICS_GRID,
  METRIC_HEAD_GAP,
  METRIC_BOX_W,
  SEGMENT,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SELECT,
  TEXT,
} from '../styles'
import { IconChevron } from './icons'
import { MenuSelect } from './Menu'
import {
  AGGREGATE,
  FAMILY_KEYS,
  MetricFamily,
  NOUN,
  RANKED_FAMILIES,
  UNIT,
  familyOf,
  windowAggregate,
} from '../metrics'
import { Constraints, hasConstraints } from '../utils/clientAnalyze'
import { FAMILY_BOUNDS, invertedFamilies } from '../utils/constraints'
import { ALL_ANSWERED, type UnansweredMetrics } from '../utils/metricReach'
import { DEFAULT_LIMIT, clampLimit } from '../utils/urlState'

// The app's core question: "top N destinations by <metric's aggregate>, lowest
// or highest". Five rows ask it (#498; record 0251): which metric, which of its
// aggregates, which way round, how many, and which bounds to add. A bound row
// stands only while its bound is set or the reader has just added it, so a
// new metric adds an option to two menus rather than a row to the panel.

// The two cells of a filter row, and what an empty one says it is for.
//
// The bounds label themselves rather than sitting under a heading row: that row
// cost a line of vertical space and pushed the first control twice as far below
// the section heading as every other section's. A filled cell drops its placeholder,
// by which point its position has said the same thing four rows running.
// Why raising this costs nothing: the cap trims what is LISTED, never what is
// fetched. Every destination in the area is forecast either way, which is also
// why the table's header can say "N of M" without a second analysis.
const LIMIT_NOTE =
  'Only limits how many destinations are added to the results. All destinations are still forecasted.'

const EDGES = [
  ['lower', AGGREGATE.minimum],
  ['upper', AGGREGATE.maximum],
] as const

// What each bound box compares, per ranked metric. The box columns are headed
// with the two aggregate names because for most rows that is literally what
// they are: the wind, temperature and freezing-level rows bound each row's own
// extremes, so a ceiling of 20 on the wind row holds the table's windiest-hour
// column at or below 20. Two cells stretch that reading, deliberately.
// Precipitation and snowfall are bounded on the window TOTAL in both columns,
// because a per-hour floor would be 0.000 almost everywhere and the noun
// already means the total in its aggregate dropdown. And the air-quality floor reads the
// worst hour too, there being no other aggregate to read.
//
// The hint is the accessible name's second sentence: a floor reads the window's
// best hour and a ceiling its worst, which is the whole design and also the
// thing that looks like a bug the first time a wind floor of 15 empties the
// table — nowhere is continuously windy. The mapping is fixed for the life of
// the app, so it is stated rather than computed.
//
// Which `Constraints` field each box edits is `FAMILY_BOUNDS` in
// `constraints.ts`, the table the gate's order check reads too (#803).
//
// `note` is the tooltip on the one row whose value can genuinely be missing —
// air quality past its ~5-day horizon. The absence is no evidence of bad
// conditions, so the row is not filtered out. Read the tooltip note in
// docs/STYLES.md before copying this pattern: an approved exception, not a
// new tool.
const BOUNDS: Record<
  MetricFamily,
  {
    id: string
    step: number
    hint: readonly [string, string]
    note?: string
  }
> = {
  precip: {
    id: 'precipitation',
    step: 0.01,
    hint: ['The total over the window must be at least this.', 'The total over the window must be at most this.'],
  },
  wind: {
    id: 'wind',
    step: 1,
    hint: ['The calmest hour must be at least this.', 'The windiest hour must be at most this.'],
  },
  temp: {
    id: 'temperature',
    step: 1,
    hint: ['The coldest hour must be at least this.', 'The hottest hour must be at most this.'],
  },
  freeze: {
    id: 'freezing-level',
    step: 100,
    hint: ['The lowest hour must be at least this.', 'The highest hour must be at most this.'],
  },
  // Precipitation's sentences word for word, because it bounds the same
  // thing: the window total at both ends (#678). A tenth of an inch per step
  // rather than a hundredth, because snow is reported in tenths.
  snowfall: {
    id: 'snowfall',
    step: 0.1,
    hint: ['The total over the window must be at least this.', 'The total over the window must be at most this.'],
  },
  // The cloud row reuses the freezing level's sentences word for word,
  // because it bounds the same thing: a floor on the window's lowest hour and
  // a ceiling on its highest (#117, #670).
  cloud_deck: {
    id: 'cloud-deck',
    step: 100,
    hint: ['The lowest hour must be at least this.', 'The highest hour must be at most this.'],
  },
  aqi: {
    id: 'air-quality',
    note: 'Destinations with no air quality forecast are included.',
    hint: ['The worst hour must be at least this.', 'The worst hour must be at most this.'],
    step: 1,
  },
}

// Every numeric box in the Metrics grid, in one shape so a new box cannot pick
// its own height or inset: py-0.5 matches the dropdown and the segment beside
// it. Only the width differs, and only because the grid gives a box either one
// column or two.
const METRIC_BOX_SHAPE = `${FIELD_NUMERIC} px-2 py-0.5 text-center`
/** A bound: one box column, paired with its opposite edge on the same row. */
const METRIC_BOX = `${METRIC_BOX_SHAPE} ${METRIC_BOX_W}`
/**
 * The results cap: both box columns, because it is one number rather than a
 * floor and a ceiling, and half a row of empty grid beside it read as a missing
 * control (TJ, 2026-09-14). `w-full` rather than a width of its own, so it
 * tracks the two columns and their gap however wide METRIC_BOX_W becomes.
 */
const METRIC_BOX_WIDE = `${METRIC_BOX_SHAPE} w-full`

// What an empty box shows. It is the metric's unit for four of the five rows,
// which is where the unit went when the labels lost the room to carry it.
//
// The US AQI has no unit: it is a dimensionless index, and `metrics.ts` says so
// by giving it an empty string — a decision that belongs to the table headers,
// which read `UNIT` through `metricLabel` and must not grow an `AQI (US)`
// (#176). So the fallback lives here rather than there. An empty box in a
// column of five filled ones read as a control that had lost its label, and the
// metric's own name is what goes in it (TJ, 2026-09-14). Lower case like every
// unit beside it, because in this column it is doing a unit's job.
const BOX_PLACEHOLDER: Record<MetricFamily, string> = {
  ...UNIT,
  aqi: 'aqi',
}


// The Aggregate menu's choices per family: the keys it ranks by, in the words
// the per-row menus carried before #498.
const AGGREGATE_OPTIONS = Object.fromEntries(
  RANKED_FAMILIES.map((family) => [
    family,
    FAMILY_KEYS[family].map((key) => ({ value: key, label: windowAggregate(key) })),
  ]),
) as Record<MetricFamily, { value: SortBy; label: string }[]>

/** Whether a metric holds a floor or a ceiling, which is what keeps its row drawn. */
const isBounded = (constraints: Constraints, family: MetricFamily): boolean =>
  FAMILY_BOUNDS[family].some((field) => constraints[field] != null)

interface ChoiceOption<V extends string> {
  value: V
  label: string
  disabled?: boolean
}

/**
 * One of the section's three menus, over the two box columns. A desk opens
 * the one menu (record 0201); a phone keeps the native select, whose picker
 * rises from the bottom like every phone menu (record 0149). Drawn in one
 * place so the three cannot differ in shape, and so the section opens its
 * menus from one field.
 */
function Choice<V extends string>({
  phone,
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
}: {
  phone: boolean
  label: string
  value: V | null
  options: readonly ChoiceOption<V>[]
  onChange: (value: V) => void
  placeholder?: string
  disabled?: boolean
}) {
  // py-0.5 is SEGMENT_ITEM_SHAPE's own vertical padding, so the menus, the
  // boxes and the segment are one height. `w-full` over the two tracks,
  // which the Order segment holds at CONTROL_W.
  const shape = `w-full ${DISABLED} px-2 py-0.5`
  return (
    // flex, not block: an inline-level select in a block wrapper reserves
    // baseline descender space below itself, which read as the field
    // sitting ~1px lower than the boxes it must align with.
    <div className="relative col-span-2 flex">
      {phone ? (
        <>
          <select
            aria-label={label}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as V)}
            className={`${SELECT} ${shape}`}
          >
            {placeholder !== undefined && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <IconChevron up={false} className={ICON_ADORNMENT} />
        </>
      ) : (
        <MenuSelect
          label={label}
          value={value}
          options={options}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={shape}
        />
      )}
    </div>
  )
}

interface Props {
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  sortDesc: boolean
  setSortDesc: (d: boolean) => void
  // Each metric's aggregate choice (#291), active metric included. App owns
  // the invariant that the active family's entry equals sortBy, so the
  // Metric menu ranks by the aggregate a metric last held.
  rowKeys: Record<MetricFamily, SortBy>
  // Whether the panel's When selection is a single hourly stamp. The
  // Aggregate menu hides then, because min, average and maximum of one hour
  // are the same number, the same way the calendar's Hours row hides under a
  // selection that takes no hours. It reads the panel rather than the
  // analyzed report, so the menu follows a When switch before it is analyzed.
  pointSample: boolean
  constraints: Constraints
  setConstraints: (c: Constraints) => void
  // Clears every bound and the results cap. No bound can widen past what the
  // browser holds, so clearing is as live as typing and never needs an Analyze.
  onClearFilters: () => void
  limit: number
  setLimit: (n: number) => void
  // Live ceiling for the results knob, from /api/capabilities (falls back to
  // the compiled analysis cap).
  maxLimit: number
  // A phone (#696), where the menus stay native selects and open the phone's
  // own picker; a desk's open the one menu (record 0201).
  phone?: boolean
  // The metrics the selected window and models cannot answer (#803,
  // `unansweredMetrics`): each one is a disabled option in the Metric and
  // Bound menus and its bound row greys, the way a Layers row greys outside
  // its coverage. The grey is the whole message; the line that blocks a
  // ranking on one is the Analyze button's.
  unanswered?: UnansweredMetrics
}

/**
 * The panel's third section: the ranking and the bounds in one table. Every
 * knob here is a presentation knob, so nothing in it needs an Analyze.
 */
export default function MetricsTable({
  sortBy,
  setSortBy,
  sortDesc,
  setSortDesc,
  rowKeys,
  pointSample,
  constraints,
  setConstraints,
  onClearFilters,
  limit,
  setLimit,
  maxLimit,
  phone = false,
  unanswered = ALL_ANSWERED,
}: Props) {
  // The metric the Bound menu last added, drawn while its row is still empty.
  // It is the one row nothing in `constraints` keeps on screen, so it is held
  // here rather than in the URL: a share link shows the bounds it carries
  // and no pending row. It leaves when the keyboard leaves its row, when
  // another metric is added, or on Clear filters, never under a reader
  // mid-edit.
  const [pending, setPending] = useState<MetricFamily | null>(null)
  // The floor box an add hands the keyboard to. A ref read after the commit
  // rather than state, because the menu that added it hands the keyboard back
  // to its own field in a layout effect of that same commit, and this has to
  // land after it.
  const floorBoxes = useRef<Partial<Record<MetricFamily, HTMLInputElement | null>>>({})
  const focusNext = useRef<MetricFamily | null>(null)
  useEffect(() => {
    const family = focusNext.current
    if (family === null) return
    focusNext.current = null
    floorBoxes.current[family]?.focus()
  })

  const active = familyOf(sortBy)
  const shown = RANKED_FAMILIES.filter((family) => family === pending || isBounded(constraints, family))
  const addable = RANKED_FAMILIES.filter((family) => !shown.includes(family))

  // What Clear filters offers to undo, and therefore whether it is drawn
  // (#498, reversing #341's always-drawn button): the rows above it already
  // come and go with the bounds, so a button that stood disabled under none
  // of them was one more row to read past. The results cap counts even
  // though it bounds nothing: a reader who typed a number there looks for
  // the same way back as for a bound.
  //
  // A value an inert box holds counts too (#803). A greyed box cannot be
  // typed in, so this button is the one way to empty it, and the number stays
  // on screen; a button that ignored it would leave a value the reader can
  // see and cannot remove.
  const filtersActive = limit !== DEFAULT_LIMIT || hasConstraints(constraints)
  // The rows whose floor is above their ceiling (#803, W7), each pair marked
  // invalid for a screen reader. The panel has no invalid look for a field, so
  // the Analyze button's line is what says it on screen.
  const inverted = new Set(invertedFamilies(constraints))

  function addBound(family: MetricFamily) {
    setPending(family)
    focusNext.current = family
  }

  function clearFilters() {
    setPending(null)
    onClearFilters()
  }

  // Two blocks with nothing drawn between them. A rule there read as a break
  // the size of the one between whole sections, which is the only thing that
  // weight is allowed to say (TJ, 2026-09-14). Five rows of wide controls
  // first, each a label beside a control over the two box columns; then,
  // once a bound row stands, METRIC_HEAD_GAP above the two box headings and
  // the rows themselves.
  return (
    <section data-tour="metrics">
      <h2 className={`${TEXT.section} mb-2.5`}>
        Metrics
      </h2>
      <div className={METRICS_GRID}>
        <span className={`${TEXT.control} truncate`} aria-hidden="true">
          Metric
        </span>
        <Choice
          phone={phone}
          label="Metric"
          value={active}
          options={RANKED_FAMILIES.map((family) => ({
            value: family,
            label: NOUN[family],
            disabled: unanswered.has(family),
          }))}
          onChange={(family) => setSortBy(rowKeys[family])}
        />
        {/* Gone for a single-hour window, where every aggregate is the same
            number, and for a metric with one aggregate to offer. */}
        {!pointSample && FAMILY_KEYS[active].length > 1 && (
          <>
            <span className={`${TEXT.control} truncate`} aria-hidden="true">
              Aggregate
            </span>
            <Choice
              phone={phone}
              label="Aggregate"
              value={sortBy}
              options={AGGREGATE_OPTIONS[active]}
              onChange={setSortBy}
              disabled={unanswered.has(active)}
            />
          </>
        )}
        {/* The one direction. Pressing a half never changes WHICH metric
            ranks; the Metric menu owns that. It spans the two box columns
            and is the one control here that wears CONTROL_W, through
            SEGMENT: the box tracks are `auto`, and with no bound row drawn
            nothing else would give them a width, so every control spanning
            them shrank to its content and grew 12px when the first bound
            row appeared. The segment is always drawn, so it holds the two
            tracks at two boxes and their gap, and the rest fill them. */}
        <span id="rank-order" className={`${TEXT.control} truncate`}>
          Order
        </span>
        <div className={`${SEGMENT} col-span-2`} role="group" aria-labelledby="rank-order">
          {[
            { desc: false, label: 'Lowest' },
            { desc: true, label: 'Highest' },
          ].map((dir, i) => (
            <button
              key={dir.label}
              aria-pressed={sortDesc === dir.desc}
              onClick={() => setSortDesc(dir.desc)}
              className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                sortDesc === dir.desc ? ACCENT.fill : SEGMENT_IDLE
              }`}
            >
              {dir.label}
            </button>
          ))}
        </div>
        {/* How many of that order to show: the rows above finish one
            sentence, "the 200 lowest by total precipitation". The ceiling
            is the live analysis cap from /api/capabilities. The default
            rides as a placeholder, like the boxes below, so changing it is
            one keystroke rather than a select-and-erase. Empty means the
            DEFAULT here, not "no cap" as it does for a bound. */}
        <label htmlFor="max-results" className={`${TEXT.control} truncate`} title={LIMIT_NOTE}>
          {AGGREGATE.maximum} results
        </label>
        <input
          id="max-results"
          type="number"
          min={1}
          max={maxLimit}
          placeholder={String(DEFAULT_LIMIT)}
          value={limit === DEFAULT_LIMIT ? '' : limit}
          onChange={(e) =>
            setLimit(clampLimit(parseInt(e.target.value) || DEFAULT_LIMIT, maxLimit))
          }
          title={LIMIT_NOTE}
          className={`${METRIC_BOX_WIDE} col-span-2`}
        />
        {/* The adder: picking a metric draws its row and puts the keyboard
            in its floor box. A metric already drawn is not offered again. */}
        <span className={`${TEXT.control} truncate`} aria-hidden="true">
          Bound
        </span>
        <Choice
          phone={phone}
          label="Bound"
          value={null}
          placeholder="Add a bound"
          options={addable.map((family) => ({
            value: family,
            label: NOUN[family],
            disabled: unanswered.has(family),
          }))}
          onChange={addBound}
          disabled={addable.length === 0}
        />
        {/* The box columns' headings, the two aggregate names: for most
            rows that is literally what a box bounds (see BOUNDS). Drawn
            only over a bound row, and carrying the section's one
            deliberate gap as padding on every cell, so the columns stay
            in step. */}
        {shown.length > 0 && (
          <>
            <div className={METRIC_HEAD_GAP} aria-hidden="true" />
            {EDGES.map(([edge, aggregate]) => (
              <span
                key={edge}
                className={`${TEXT.caption} ${METRIC_HEAD_GAP} text-center`}
                aria-hidden="true"
              >
                {aggregate}
              </span>
            ))}
          </>
        )}
        {shown.map((family) => {
          const bounds = BOUNDS[family]
          const edgeKeys = FAMILY_BOUNDS[family]
          // The window or the models cannot answer this metric: its boxes
          // grey and take no input, keeping what they hold, and Clear filters
          // stays the way to empty them.
          const inert = unanswered.has(family)
          return (
            <Fragment key={family}>
              {/* `contents` so the row's cells stay grid items while the
                  row still hears the keyboard leave it. */}
              <div
                className="contents"
                onBlur={(e) => {
                  if (family === pending && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setPending(null)
                  }
                }}
              >
                {/* Full ink on an inert row too, as a greyed Layers row's
                    label keeps it (#803, M9): the faded boxes say it, and
                    faded text owes a ratio it cannot meet. */}
                <span className={`${TEXT.control} truncate`} title={inert ? undefined : bounds.note}>
                  {NOUN[family]}
                </span>
                {EDGES.map(([edge, aggregate], i) => (
                  <input
                    key={edge}
                    ref={i === 0 ? (el) => void (floorBoxes.current[family] = el) : undefined}
                    id={`${bounds.id}-${edge}`}
                    title={inert ? undefined : bounds.note}
                    type="number"
                    step={bounds.step}
                    placeholder={BOX_PLACEHOLDER[family]}
                    aria-label={`${NOUN[family]} ${aggregate}. ${bounds.hint[i]}`}
                    aria-invalid={!inert && inverted.has(family) ? true : undefined}
                    disabled={inert}
                    value={constraints[edgeKeys[i]] ?? ''}
                    onChange={(e) =>
                      setConstraints({
                        ...constraints,
                        [edgeKeys[i]]: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={`${METRIC_BOX} ${DISABLED}`}
                  />
                ))}
              </div>
            </Fragment>
          )
        })}
        {/* Under the two box columns, so the one control with no label sits
            where every bound it clears does. */}
        {filtersActive && (
          <button
            onClick={clearFilters}
            className={`${BUTTON_SECONDARY} col-span-2 col-start-2 mt-0.5`}
          >
            Clear filters
          </button>
        )}
      </div>
    </section>
  )
}
