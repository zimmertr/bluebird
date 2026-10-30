import { Fragment } from 'react'
import { SortBy } from '../types'
import {
  ACCENT,
  BUTTON_SECONDARY,
  CHOICE_INPUT,
  CHOICE_ROW,
  DISABLED,
  FIELD_NUMERIC,
  METRICS_GRID,
  METRIC_HEAD_GAP,
  METRIC_BOX_W,
  METRIC_LABEL_PITCH,
  MUTED,
  SEGMENT_FILL,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SELECT_W_AGGREGATE,
  TEXT,
} from '../styles'
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

// The app's core question: "top N peaks by <metric's aggregate>, lowest or
// highest". Each row is a metric; which of its aggregate columns it ranks by
// is the row's dropdown (#291), so the label is the bare noun and the
// reduction lives in the control beside it.

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

// Each row's aggregate menu at a desk (record 0201): the keys its family
// ranks by, in the words the native select's options carried.
const AGGREGATE_OPTIONS = Object.fromEntries(
  RANKED_FAMILIES.map((family) => [
    family,
    FAMILY_KEYS[family].map((key) => ({ value: key, label: windowAggregate(key) })),
  ]),
) as Record<MetricFamily, { value: SortBy; label: string }[]>

interface Props {
  sortBy: SortBy
  setSortBy: (s: SortBy) => void
  sortDesc: boolean
  setSortDesc: (d: boolean) => void
  // Each metric row's aggregate choice (#291), active row included. App owns
  // the invariant that the active family's entry equals sortBy; changing any
  // row's dropdown goes through setSortBy, which is what makes a dropdown
  // change activate its row the way the direction toggle always has.
  rowKeys: Record<MetricFamily, SortBy>
  // Whether the panel's When selection is a single hourly stamp. The aggregate
  // dropdowns hide then, because min, average and maximum of one hour are the
  // same number, the same way the calendar's Hours row hides under a selection
  // that takes no hours. It reads the panel rather than the analyzed report, so
  // the dropdowns follow a When switch before it is analyzed.
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
  // A phone (#696), where the aggregate's menu opens as a bottom sheet; a
  // desk's opens the one menu's card (records 0201 and 0252).
  phone?: boolean
  // The metrics the selected window and models cannot answer (#803,
  // `unansweredMetrics`): each one's row greys, the way a Layers row greys
  // outside its coverage. The grey row is the whole message; the line that
  // blocks a ranking on one is the Analyze button's.
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
  // What Clear filters offers to undo, and therefore whether it is enabled.
  // The button is always drawn: a control that appears and disappears moves
  // everything under it and has to be found again, where a disabled one stays
  // where the reader last saw it (TJ, 2026-09-14). The results cap counts even
  // though it bounds nothing: it is one of the seven knobs in the table, a
  // reader who typed a number there looks for the same way back as for a
  // bound, and leaving it out meant the one control the button skipped was the
  // one sitting right above it.
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

  // Metrics — the ranking and the bounds in one table (#341). One row
  // per metric: its radio, its aggregate dropdown, and its floor and
  // ceiling boxes, so the two questions the panel used to ask in two
  // sections 50px apart in height — "order by what?" and "who
  // qualifies?" — are answered on the same line. The Lowest/Highest
  // choice is ONE segment above the rows rather than one per row: it is
  // a property of the ranking, not of each metric, and four of the five
  // per-row segments were disabled at any moment. The dropdowns hide
  // for a single-hour window, where every aggregate is the same number,
  // and each label spans the empty column so the row keeps one gap.
  //
  // The section reads in two blocks, and nothing is drawn between
  // them. A rule there read as a break the size of the one between whole
  // sections, which is the only thing that weight is allowed to say (TJ,
  // 2026-09-14). Shape and space tell them apart instead: two wide
  // controls saying how the list is ordered and how far down it goes,
  // then METRIC_HEAD_GAP above the two box headings, then the table
  // of the five bounds the ranking can use.
  return (
    <section data-tour="metrics">
      <h2 className={`${TEXT.section} mb-2.5`}>
        Metrics
      </h2>
      <div className={METRICS_GRID}>
        {/* The one direction. Pressing a half never changes WHICH metric
            ranks; the radios own that. Two grid cells rather than a row of
            its own: the label spans the label and dropdown columns like
            each metric row's label below, and the segment spans the two box columns, so
            it is the boxes' width in both states and every control in the
            section shares their two edges. That is why it wears
            SEGMENT_FILL rather than SEGMENT, whose CONTROL_W would hang
            past the boxes on the left. */}
        <span id="rank-by" className={`${TEXT.control} col-span-2 truncate`}>
          Rank by
        </span>
        <div className={`${SEGMENT_FILL} col-span-2`} role="group" aria-labelledby="rank-by">
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
        {/* How many of that order to show, directly under the direction
            that orders it: the two finish one sentence — "the 200 lowest by
            total precipitation" — and neither is a bound, so they sit above
            the table of bounds rather than in it (TJ, 2026-09-14). Being
            the pair of wide controls over a table of narrow ones is what
            separates them; nothing is drawn.

            The ceiling is the live analysis cap from /api/capabilities. The
            default rides as a placeholder, like the boxes below, so
            changing it is one keystroke rather than a select-and-erase.
            Empty means the DEFAULT here, not "no cap" as it does for a
            bound: this knob always has a value, and the row count in the
            table's header says what it is doing. */}
        <label
          htmlFor="max-results"
          className={`${TEXT.control} col-span-2 truncate`}
          title={LIMIT_NOTE}
        >
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
        {/* The box columns' headings, the two aggregate names: for most
            rows that is literally what a box bounds (see BOUNDS). The
            unit moved from the label into each box's placeholder, because
            `Freezing level (ft)` does not fit beside a dropdown and two
            boxes; the heading is what says which box is which.

            The row carries the section's one deliberate gap. Padding above
            every cell of it, rather than a margin on one, keeps the four
            columns of the grid in step; it is what tells the two wide
            controls above from the table below now that no rule may (TJ,
            2026-09-14). */}
        <div className={`col-span-2 ${METRIC_HEAD_GAP}`} aria-hidden="true" />
        {EDGES.map(([edge, aggregate]) => (
          <span
            key={edge}
            className={`${TEXT.caption} ${METRIC_HEAD_GAP} text-center`}
            aria-hidden="true"
          >
            {aggregate}
          </span>
        ))}
        {RANKED_FAMILIES.map((family) => {
          const rowKey = rowKeys[family]
          const isActive = familyOf(sortBy) === family
          const bounds = BOUNDS[family]
          const edgeKeys = FAMILY_BOUNDS[family]
          // The window or the models cannot answer this metric: its radio, its
          // aggregate and its boxes grey and take no input, the boxes keeping
          // what they hold. A ranking already on it stays checked, and the
          // gate blocks it with the line that says why.
          const inert = unanswered.has(family)
          return (
            <Fragment key={family}>
              {/* The label's own margin sets the row pitch (32px on a fine
                  pointer), so the radio and the bound boxes pass the 24px
                  spacing test without any of them growing (#687). */}
              <label
                className={`${CHOICE_ROW} ${METRIC_LABEL_PITCH} min-w-0 ${pointSample ? 'col-span-2' : ''}`}
                title={inert ? undefined : bounds.note}
              >
                <input
                  type="radio"
                  name="sort_metric"
                  checked={isActive}
                  disabled={inert}
                  onChange={() => setSortBy(rowKey)}
                  className={CHOICE_INPUT}
                />
                <span className="truncate">{NOUN[family]}</span>
              </label>
              {!pointSample && (
                // flex, not block: an inline-level select in a block
                // wrapper reserves baseline descender space below itself,
                // which read as the dropdown sitting ~1px lower than the
                // boxes it must align with.
                <div className={`relative flex ${isActive || inert ? '' : MUTED}`}>
                  {/* py-0.5 is SEGMENT_ITEM_SHAPE's own vertical padding, so the
                      dropdown, the boxes and the segment above are the
                      same height. */}
                  {/* The one menu at a desk and its sheet on a phone (record
                      0252), so the aggregate is a field trigger like every other. */}
                  <MenuSelect
                    label={`${NOUN[family]} aggregate`}
                    value={rowKey}
                    options={AGGREGATE_OPTIONS[family]}
                    onChange={setSortBy}
                    disabled={inert}
                    sheet={phone}
                    className={`${SELECT_W_AGGREGATE} px-2 py-0.5`}
                  />
                </div>
              )}
              {EDGES.map(([edge, aggregate], i) => (
                <input
                  key={edge}
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
            </Fragment>
          )
        })}
        {/* Under the two box columns, on their outer edges, so the one
            control with no label sits where every bound it clears does. */}
        <button
          onClick={onClearFilters}
          disabled={!filtersActive}
          className={`${BUTTON_SECONDARY} ${DISABLED} col-span-2 col-start-3 mt-0.5`}
        >
          Clear filters
        </button>
      </div>
    </section>
  )
}
