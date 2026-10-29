import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import { useExit } from '../hooks/useExit'
import { familyOf, metricLabel } from '../metrics'
import type { SortBy } from '../types'
import {
  ACCENT,
  CONTROL_SIZE,
  DISABLED,
  LINK,
  MAP_CHIP_MENU,
  RADIUS,
  STATUS,
  SR_ONLY,
  SURFACE_CHIP_CARD,
  SWATCH_CHIP,
  SWATCH_STAR,
  SWATCH_EDGE,
  SWATCH_LINE,
  SWATCH_RAMP,
  SWATCH_RAMP_SCRIM,
  SWATCH_RAMP_TICK,
  TEXT,
} from '../styles'
import BottomSheet from './BottomSheet'
import { MenuButton } from './Menu'
import { writeViewPrefs } from '../utils/viewPrefs'
import { USFS_HREF, closureAreaSwatch, closureTrailSwatch } from '../utils/closures'
import { FIRMS_HREF, STARBURST_INNER, fireActivityLegendChips, starburst } from '../utils/fireActivity'
import type { LabelledScale } from '../utils/colors'
import { type RampTick, scaleRampCss, scaleTicks } from '../utils/legendRamp'
import { IEM_HREF, radarSwatchCss } from '../utils/radar'
import { legendMaxCss } from '../utils/results/resultsSheet'
import { HMS_HREF, SMOKE_DENSITIES, SMOKE_EDGE, smokeSwatch } from '../utils/smoke'
import { NOHRSC_HREF, SNOW_LABEL, SNOW_RAMP, snowRampCss, snowTicks } from '../utils/snowDepth'
import { NIFC_HREF, wildfireSwatch } from '../utils/wildfires'

// The legend's starburst, in a 24-unit box about its centre: the points at
// 11.5, inside the box by half the edge's width.
const FIRE_STAR_CHIP = starburst(11.5, STARBURST_INNER.chip)
  .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
  .join(' ')

/**
 * One section of the map's legend box: what it keys, who it came from, and the
 * key itself (#454).
 *
 * Two shapes, and the difference is the DATA's rather than the section's. A key
 * on a single value is a ROW — its label on the left, its swatch on the right.
 * A key on a SCALE is the strip across the box with its numbers INSIDE it,
 * because six bands of temperature and eleven of depth are not things a 14px
 * chip can say, and a row per band is seven lines and eleven on a map that can
 * be 161px tall. Inside rather than under, so the whole key is one line: a
 * scale section is 40px where two of them under their strips were 54 apiece
 * (TJ, 2026-09-17).
 *
 * One function for every shape, and one for the metric key and the layers alike,
 * because the sections are sorted by their labels at the call site: a shape
 * that could only be built inline could not take its place in that order. They
 * had already drifted into two shapes once, six swatch rows against a strip.
 *
 * `credit` is what the data licences ask for, and it is a section's own rather
 * than a list somewhere else so a credit stands beside the thing it describes.
 */
function legendSection({
  label,
  credit,
  swatch,
  ramp,
}: {
  label: string
  credit?: { href: string; name: string }
  /** What sits at the right of a single-value row. */
  swatch?: ReactNode
  /** The strip and its numbers, for a section keyed on a scale. */
  ramp?: { css: string; ticks: RampTick[]; bands: number }
}) {
  const name = (
    <span className={TEXT.control}>
      {label}
      {credit && (
        <>
          {' ('}
          <a href={credit.href} target="_blank" rel="noopener noreferrer" className={LINK}>
            {credit.name}
          </a>
          {')'}
        </>
      )}
    </span>
  )
  if (!ramp) {
    return (
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        {name}
        {swatch}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {name}
      {/* The strip IS the grid its numbers sit in, so the whole key is one
          line: a band per column, so a tick lands on the boundary it names
          however wide the box is. `minmax(0,1fr)` rather than `1fr` — the last
          label is wider than a band, and a plain fr track would grow to fit it
          and shift every tick left of it.

          A boundary is a column EDGE, not a column, so a centred tick spans
          the two columns that meet on it and centres across the pair — grid
          has no way to centre one item on a track's edge. The other two
          alignments sit in one column each and hang from the edge that is the
          boundary: `start` in the column that begins there, `end` in the one
          that ends at the strip's own right edge.

          Not `aria-hidden`, which the strip carried while its numbers were
          outside it: they are the strip's own children now, and hiding it
          would take the scale off a screen reader with them. */}
      <span
        className={SWATCH_RAMP}
        style={{
          backgroundImage: ramp.css,
          borderColor: SWATCH_EDGE,
          gridTemplateColumns: `repeat(${ramp.bands}, minmax(0, 1fr))`,
        }}
      >
        <span className={SWATCH_RAMP_SCRIM} aria-hidden="true" />
        {ramp.ticks.map((tick) => (
          <span
            key={tick.label}
            className={SWATCH_RAMP_TICK}
            style={{
              gridColumn:
                tick.align === 'center'
                  ? `${tick.at} / ${tick.at + 2}`
                  : `${tick.at + 1} / span 1`,
              justifySelf: tick.align,
            }}
          >
            {tick.label}
          </span>
        ))}
      </span>
    </div>
  )
}

/** What decides which sections the legend holds, wherever it is drawn. */
export interface LegendInputs {
  /** The ranking, whose metric names the key. */
  sortBy: SortBy
  /** The markers' scale: the hourly one during playback, the window's otherwise. */
  markerScale: LabelledScale | null
  /** Whether the report's markers are on the map and coloured. */
  hasColoredMarkers: boolean
  /** Whether the ranked metric has any value on the rows shown (`fieldHasValue`). */
  rankedFieldHasValue: boolean
  /** Which overlays are on, each keyed by a section. */
  overlays: Pick<
    MapOverlays,
    | 'showWildfires'
    | 'showAreaClosures'
    | 'showTrailClosures'
    | 'showRadar'
    | 'showSmoke'
    | 'showSnow'
    | 'showFireActivity'
  >
  /** The forecast grid's state and its row (`useGridLayer`). */
  grid: Pick<GridLayer, 'gridPainted' | 'gridCued' | 'gridFailed' | 'gridLegend'>
}

/** One section, as `legendSection` draws it. */
export type LegendSectionSpec = Parameters<typeof legendSection>[0]

/**
 * Every section the legend holds now, in the order it reads them: the one
 * answer a desk's box on the map and a phone's Legend sheet both draw (#696),
 * so the two cannot disagree about what is keyed. Empty when nothing on the
 * map has anything to key, which is also what greys the phone's Legend chip.
 * `smokeId` is the caller's `useId`, which names the smoke chips' hidden words.
 */
export function legendSections(
  { sortBy, markerScale, hasColoredMarkers, rankedFieldHasValue, overlays, grid }: LegendInputs,
  smokeId: string,
): LegendSectionSpec[] {
  const { showWildfires, showAreaClosures, showTrailClosures, showRadar, showSmoke, showSnow, showFireActivity } =
    overlays
  const { gridPainted, gridCued, gridFailed, gridLegend } = grid
  // ONE box, gaining and losing sections as the report and the
  // layers change (#454). It was two — the layer rows in one, the
  // six-row metric key in another — which cost a border, a gap and
  // a second backdrop on a map that can be 161px tall on a phone.
  //
  // **Alphabetical by the label each section READS**, the metric
  // key included (TJ, 2026-09-17). Nothing ranks these against
  // each other — no cost, no severity, no dependency — so any
  // other order is one the reader has to learn, and a key that is
  // a list member cannot be a headline above the list. It costs
  // the metric key a fixed position: a temperature ranking sorts
  // last and an AQI one first. That is the order working rather
  // than the key moving on its own, and it is the same rule that
  // moved `Active wildfire` off the bottom, where it had been
  // sorting under the Layers popover's own name for it.
  //
  // Sorted on the way out rather than written in order, because one of
  // the labels is the ranked metric's and changes under the reader.
  // Every label is spelled once, as the sort key AND as what the
  // section renders, so the two cannot disagree.
  const sections: LegendSectionSpec[] = [
    // Keyed to the markers OR to the grid, because either can be
    // the only colored thing on screen: a live filter can empty
    // the table while the field still paints, and colors without
    // their key are noise. One section serves both — they are
    // scored on the same scale by construction (#246), which is
    // also why the grid has no swatch of its own in its row.
    //
    // The strip follows `markerScale`, so playback's swap to an
    // hourly precipitation scale moves the bands and the numbers
    // with the markers. The bare metric is all the label says:
    // which hour or window the colors describe, how it was
    // reduced, and — for wind — which datum produced it (#361)
    // are all stated by the results header and the table's own
    // column headers.
    ...(markerScale !== null &&
    rankedFieldHasValue &&
    (hasColoredMarkers || gridPainted || gridCued)
      ? [
          {
            // `Temperature (°F)`, by the same composer the table
            // headers use, reading the SCALE's unit so playback's
            // swap to the hourly rate relabels the strip with its
            // bands. No aggregate and no qualifier: which hour or
            // window the colours describe, how it was reduced,
            // and — for the wind and the temperature — which
            // datum produced it (#361, #443) are all stated by
            // the results header and the table's own column
            // headers. AQI reads as the bare noun, its index
            // having no unit.
            label: metricLabel(
              familyOf(sortBy),
              undefined,
              markerScale.unit,
            ),
            ramp: {
              css: scaleRampCss(markerScale),
              ticks: scaleTicks(markerScale),
              bands: markerScale.colors.length,
            },
          },
        ]
      : []),
    // CC BY 3.0 wants the credit wherever the fire data is drawn,
    // and section 4(b) lets it be "implemented in any reasonable
    // manner" — so it is the section's own label. The licence URI
    // section 4(a) asks for lives in DataSourceList, which both
    // document pages render.
    ...(showWildfires
      ? [
          {
            label: 'Active wildfire',
            credit: { href: NIFC_HREF, name: 'NIFC' },
            swatch: (
              <span
                className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                style={wildfireSwatch()}
              />
            ),
          },
        ]
      : []),
    // The satellite fire detections (#799): one line like Smoke's, a
    // starburst per age band, newest first, each the band's fill in the
    // layer's edge with the hour the band ends at inside it, read from the
    // module that paints the map so the key and the picture cannot disagree.
    // FIRMS asks to be acknowledged wherever its data is used; the section's
    // credit is that, and NOTICES.md carries the full sentence.
    ...(showFireActivity
      ? [
          {
            label: 'Fire activity',
            credit: { href: FIRMS_HREF, name: 'FIRMS' },
            swatch: (
              <span className="flex flex-shrink-0 gap-0.5">
                {fireActivityLegendChips().map((chip) => (
                  <span key={chip.label} className={SWATCH_STAR}>
                    <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="-12 -12 24 24">
                      <polygon
                        points={FIRE_STAR_CHIP}
                        fill={chip.fill}
                        stroke={chip.stroke}
                        strokeWidth={1}
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="relative">{chip.label}</span>
                  </span>
                ))}
              </span>
            ),
          },
        ]
      : []),
    // The closure orders (#550). US government work, so no licence
    // asks for the credit; it is here because every layer that draws
    // somebody else's data names them in its own section. The area
    // keys on the fire's chip in the closure hue, and the trail on a
    // dashed rule, because a line is what it draws.
    ...(showAreaClosures
      ? [
          {
            label: 'Area closures',
            credit: { href: USFS_HREF, name: 'USFS' },
            swatch: (
              <span
                className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                style={closureAreaSwatch()}
              />
            ),
          },
        ]
      : []),
    ...(showTrailClosures
      ? [
          {
            label: 'Trail closures',
            credit: { href: USFS_HREF, name: 'USFS' },
            swatch: <span className={SWATCH_LINE} style={closureTrailSwatch()} />,
          },
        ]
      : []),
    // No swatch: the grid's colours are the metric key's, which
    // the markers share. What this row adds is the one thing that
    // IS the grid's own — how far apart the samples are, or why
    // it is not there yet. Every state right-justifies its value
    // like every other row, statuses included: one row breaking
    // the column reads as a fault rather than as a distinction.
    ...(gridPainted || gridCued || gridFailed
      ? [
          {
            label: gridLegend.label,
            swatch: (
              // Colored by state (TJ, 2026-08-21): amber while
              // the grid is waiting or loading so a stall catches
              // the eye, red when it failed, and the accent once
              // the pitch is real. The size is the colorless
              // CONTROL_SIZE because a color beside
              // TEXT.control's own would resolve by stylesheet
              // order.
              <span
                className={`${CONTROL_SIZE} ${
                  gridLegend.kind === 'pitch'
                    ? ACCENT.text
                    : gridLegend.kind === 'error'
                      ? STATUS.error
                      : STATUS.warn
                } flex-shrink-0`}
              >
                {gridLegend.value}
              </span>
            ),
          },
        ]
      : []),
    ...(showRadar
      ? [
          {
            label: 'Rain radar',
            credit: { href: IEM_HREF, name: 'IEM' },
            // A gradient rather than banded swatches: NEXRAD's
            // own reflectivity ramp is continuous, and a legend
            // that invented boundaries would assert thresholds
            // Bluebird Forecast does not know.
            swatch: (
              <span
                className={`inline-block h-3.5 w-3.5 flex-shrink-0 ${RADIUS.control} border`}
                style={{
                  backgroundImage: radarSwatchCss(),
                  borderColor: SWATCH_EDGE,
                }}
              />
            ),
          },
        ]
      : []),
    ...(showSmoke
      ? [
          {
            label: 'Smoke',
            credit: { href: HMS_HREF, name: 'NOAA' },
            // One lettered chip per density rather than three
            // rows. Opacity is the whole encoding here, so the
            // three chips also read as a ramp side by side,
            // which they could not do stacked. The letter is
            // what keeps them nameable at 14px.
            swatch: (
              <span className="flex flex-shrink-0 gap-0.5">
                {SMOKE_DENSITIES.map((density) => (
                  <span
                    key={density}
                    className={SWATCH_CHIP}
                    style={{
                      backgroundColor: smokeSwatch(density),
                      borderColor: SMOKE_EDGE,
                    }}
                    // A letter is not nameable on sight. The word
                    // it stands for is the same one the plume
                    // popup and the layer use, so this names it
                    // rather than introducing a second
                    // vocabulary. The word is also hidden text
                    // in the chip, because a title reaches a
                    // pointer and nobody else (#576).
                    title={density}
                    aria-describedby={`${smokeId}-${density}`}
                  >
                    {density[0]}
                    <span id={`${smokeId}-${density}`} className={SR_ONLY}>
                      {density}
                    </span>
                  </span>
                ))}
              </span>
            ),
          },
        ]
      : []),
    // Hard-stopped between bands where the metric strip blends,
    // because those boundaries are NOAA's own classification —
    // the picture and its key have to agree, which is why both
    // read `snowDepth.ts`.
    ...(showSnow
      ? [
          {
            label: SNOW_LABEL,
            credit: { href: NOHRSC_HREF, name: 'NOHRSC' },
            ramp: {
              css: snowRampCss(),
              ticks: snowTicks(),
              bands: SNOW_RAMP.length,
            },
          },
        ]
      : []),
  ]
  return sections.sort((a, b) => a.label.localeCompare(b.label))
}

/** The sections themselves, in their order, with no box around them: a phone's Legend sheet holds them (#696). */
export function LegendSections({ sections }: { sections: readonly LegendSectionSpec[] }) {
  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.label}>{legendSection(section)}</Fragment>
      ))}
    </>
  )
}

interface MapLegendProps {
  /** What the card or the sheet holds (`legendSections`). */
  sections: readonly LegendSectionSpec[]
  /** A phone (#696): the key is a bottom sheet, rather than a card under the chip. */
  sheet: boolean
  /** How far the results sheet stands over the map's bottom edge (0 at a desk). */
  sheetLiftPx: number
  /** Whether the forecast player's bar is on screen. */
  timelineShown: boolean
  /** Whether a desk's card opens unfolded: the reader's last answer (`viewPrefs.legendOpen`), or open. */
  initiallyOpen: boolean
}

/**
 * The map's legend: the `Legend` chip in the row under the search pill and
 * the key it opens (#454; #409 cut it out of `App.tsx`). The chip greys while
 * no section has anything to key, so the row keeps one shape from arrival to
 * results.
 *
 * At a desk the key is a card 4px under the chip (#714; record 0174), open
 * until the reader folds it, and folded or open again on their next visit
 * (`viewPrefs.legendOpen`), because a key belongs on the map beside the
 * markers it explains. On a phone it is a bottom sheet (record 0136), shut
 * until asked for and never remembered, because a sheet covers the map.
 */
export default function MapLegend({ sections, sheet, sheetLiftPx, timelineShown, initiallyOpen }: MapLegendProps) {
  const [deskOpen, setDeskOpen] = useState(initiallyOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  const shown = sections.length > 0
  // A key can go while its sheet is open (a layer switched off elsewhere, a
  // report put back), and the chip greys under it; the sheet goes with it
  // rather than coming back by itself with the next key. A desk's card keeps
  // the reader's answer instead: it is a setting, not a gesture.
  useEffect(() => {
    if (!shown) setSheetOpen(false)
  }, [shown])
  const open = (sheet ? sheetOpen : deskOpen) && shown
  // A desk's card folds the way it opened, over `MOTION.menu`'s 150ms.
  const chipRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const closing = useExit(open && !sheet, cardRef, chipRef)
  const toggle = () => {
    if (sheet) {
      setSheetOpen((o) => !o)
      return
    }
    setDeskOpen(!deskOpen)
    writeViewPrefs({ legendOpen: !deskOpen })
  }
  const chip = (
    <MenuButton
      ref={chipRef}
      shape="chip"
      open={open}
      chevron={!sheet}
      onClick={toggle}
      disabled={!shown}
      className={DISABLED}
    >
      Legend
    </MenuButton>
  )
  if (sheet) {
    return (
      <>
        {chip}
        {open && (
          <BottomSheet heading="Legend" onClose={() => setSheetOpen(false)}>
            <LegendSections sections={sections} />
          </BottomSheet>
        )}
      </>
    )
  }
  return (
    <div className="relative flex-shrink-0">
      {chip}
      {(open || closing) && (
        <div
          ref={cardRef}
          data-state={closing ? 'closing' : 'open'}
          // A popup keeps clear of this card (`resultsLayer.ts` finds every
          // `data-map-overlay`).
          data-map-overlay=""
          className={`${SURFACE_CHIP_CARD.key} ${MAP_CHIP_MENU} flex flex-col gap-1 overflow-y-auto overscroll-contain`}
          // What is left of the map under the rows, less the floor the old
          // stack kept: the player's band while it is on screen and a plain
          // gap otherwise (`legendMaxPx`). A key too tall for that scrolls
          // inside the card rather than running under the player.
          style={{ maxHeight: legendMaxCss(sheetLiftPx, timelineShown) }}
        >
          <LegendSections sections={sections} />
        </div>
      )}
    </div>
  )
}
