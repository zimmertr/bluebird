import { Fragment, type ReactNode } from 'react'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import { familyOf, metricLabel } from '../metrics'
import type { SortBy } from '../types'
import {
  ACCENT,
  CONTROL_SIZE,
  LEGEND_TOP,
  LINK,
  MAP_COL_GAP,
  MAP_COL_W,
  MAP_EDGE,
  RADIUS,
  STATUS,
  SURFACE_FLOATING,
  SWATCH_CHIP,
  SWATCH_EDGE,
  SWATCH_RAMP,
  SWATCH_RAMP_SCRIM,
  SWATCH_RAMP_TICK,
  TEXT,
  YIELD_EMPTY,
} from '../styles'
import type { LabelledScale } from '../utils/colors'
import { type RampTick, scaleRampCss, scaleTicks } from '../utils/legendRamp'
import { IEM_HREF } from '../utils/radar'
import { legendBottomPx } from '../utils/resultsSheet'
import { HMS_HREF, SMOKE_DENSITIES, SMOKE_EDGE, smokeSwatch } from '../utils/smoke'
import { NOHRSC_HREF, SNOW_LABEL, SNOW_RAMP, snowRampCss, snowTicks } from '../utils/snowDepth'
import { NIFC_HREF } from '../utils/wildfires'

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
 * One function for both, and one for the metric key and the layers alike,
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

interface MapLegendProps {
  /** The ranking, whose metric names the key. */
  sortBy: SortBy
  /** The markers' scale: the hourly one during playback, the window's otherwise. */
  markerScale: LabelledScale | null
  /** Whether the report's markers are on the map and coloured. */
  hasColoredMarkers: boolean
  /** Whether the ranked metric has any value on the rows shown (`fieldHasValue`). */
  rankedFieldHasValue: boolean
  /** Which overlays are on, each keyed by a section. */
  overlays: Pick<MapOverlays, 'showWildfires' | 'showRadar' | 'showSmoke' | 'showSnow'>
  /** The forecast grid's state and its row (`useGridLayer`). */
  grid: Pick<GridLayer, 'gridPainted' | 'gridCued' | 'gridFailed' | 'gridLegend'>
  /** Whether the panel is open; the column above is one row taller while it is not. */
  sidebarOpen: boolean
  /** How far the results sheet stands over the map's bottom edge. */
  sheetLiftPx: number
  /** Whether the forecast player's bar is on screen. */
  timelineShown: boolean
}

/**
 * The map's one legend box and the stack it scrolls in (#454; #409 cut it out
 * of `App.tsx`). Nothing when nothing on the map is coloured or switched on.
 */
export default function MapLegend({
  sortBy,
  markerScale,
  hasColoredMarkers,
  rankedFieldHasValue,
  overlays,
  grid,
  sidebarOpen,
  sheetLiftPx,
  timelineShown,
}: MapLegendProps) {
  const { showWildfires, showRadar, showSmoke, showSnow } = overlays
  const { gridPainted, gridCued, gridFailed, gridLegend } = grid
  if (!(hasColoredMarkers || gridPainted || gridCued || gridFailed || showWildfires || showSmoke || showRadar || showSnow)) {
    return null
  }
  // Top-anchored legends: they hang one gap under the Layers button
  // (`LEGEND_TOP`) and grow downward, at EVERY width.
  //
  // A key belongs where the reader last looked for it. Anchored to
  // the bottom instead, the stack rode up and down with every panel
  // drag and every results mode, so a box that had said nothing new
  // appeared to be moving on its own — and on a phone the last box
  // ended up under the forecast player. Anchored here it is a fixed
  // landmark under the button that switches the layers it explains,
  // and what gives when the map runs short is the tail of the stack
  // rather than its position.
  //
  // The inset is what clears the Controls/search/Layers column above,
  // and it is two numbers rather than one because that column is two
  // heights: `TAP` floors the search row and the Layers button at 44
  // for a finger, so the column ends at 92 under a pointer and 108
  // under a finger. The role holds both with the arithmetic; the rule
  // is that the stack sits one of the column's own 8px gaps below
  // whichever it is. Anything shorter collides — at 76 the first rows
  // paint behind the Layers button, which is opaque and paints after
  // the legends (see the ordering note where `MapStage.tsx` renders this) —
  // and anything taller is
  // dead map.
  //
  // It used to lift at `lg`, on the reasoning that a desktop map has
  // room to spare — but "top-auto" does not mean "as tall as it
  // likes", it means the box starts wherever its content puts it,
  // which on a wide map was 54px: straight through the Layers button
  // at 54-92. Same collision, reached from the other side.
  //
  // The `bottom` offset is a ceiling on the scroll box, not an
  // anchor: it stops the stack above the timeline's band while the
  // bar is on screen, and above the sheet's top edge on a phone, so
  // no box is ever half under a control. Overflow leaves through the
  // bottom, which is the edge a scroll can follow — a stack that
  // overflowed its START edge would put boxes at negative
  // coordinates with `scrollTop` pinned at 0 and no way to reach
  // them, which is measured and is why the bottom anchoring is not
  // coming back. A sheet dragged tall closes the box to nothing, and
  // a double press on its grip brings the legends back with the rest
  // of the default.
  return (
    <div
      // The inset clears the button column above, which is one row
      // taller while the panel is collapsed and the Controls button
      // stands in it. `LEGEND_TOP` carries both heights; picking
      // between them here is the only thing that knows which one is on
      // screen.
      className={`absolute ${MAP_EDGE.left} ${
        sidebarOpen ? LEGEND_TOP.compact : LEGEND_TOP.full
      } z-10 flex flex-col ${MAP_COL_GAP} overflow-y-auto [&>*]:flex-shrink-0 ${YIELD_EMPTY}`}
      // The floor of the scroll box, derived rather than chosen: the
      // transport's whole band while the bar is on screen and a plain
      // gap otherwise, measured from whatever stands on the map's
      // bottom edge — the edge itself where the results are docked, the
      // top of the sheet where they cover it (#249).
      style={{ bottom: legendBottomPx(sheetLiftPx, timelineShown) }}
    >
      {/* ONE box, gaining and losing sections as the report and the
          layers change (#454). It was two — the layer rows in one, the
          six-row metric key in another — which cost a border, a gap and
          a second backdrop on a map that can be 161px tall on a phone.

          **Alphabetical by the label each section READS**, the metric
          key included (TJ, 2026-09-17). Nothing ranks these against
          each other — no cost, no severity, no dependency — so any
          other order is one the reader has to learn, and a key that is
          a list member cannot be a headline above the list. It costs
          the metric key a fixed position: a temperature ranking sorts
          last and an AQI one first. That is the order working rather
          than the key moving on its own, and it is the same rule that
          moved `Active wildfire` off the bottom, where it had been
          sorting under the Layers popover's own name for it.

          Sorted here rather than written in order, because one of the
          labels is the ranked metric's and changes under the reader.
          Every label is spelled once, as the sort key AND as what the
          section renders, so the two cannot disagree. */}
      {/* The tutorial lights this box rather than the column around it, which
          runs down to the player and would light an empty stretch of map. */}
      <div data-tour="legend" className={`${SURFACE_FLOATING} ${MAP_COL_W} flex flex-col gap-1 px-2.5 py-2`}>
        {[
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
                      style={{
                        backgroundColor: 'rgba(220,38,38,0.35)',
                        borderColor: '#b91c1c',
                      }}
                    />
                  ),
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
                        backgroundImage:
                          'linear-gradient(90deg,#1c8a3c,#40b450,#e7c000,#eb7814)',
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
                          // vocabulary.
                          title={density}
                        >
                          {density[0]}
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
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((section) => (
            <Fragment key={section.label}>{legendSection(section)}</Fragment>
          ))}
      </div>
    </div>
  )
}
