import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import { cellStyle, scaleFor } from '../utils/colors'
import { FAMILY_KEYS, familyOf } from '../metrics'
import { chartKey, rowsBetween, selectionState } from '../utils/chartData'
import {
  SortDir,
  SortKey,
  MODEL_KEY,
  WILDFIRE_KEY,
  displayedColumns,
  ColDef,
} from '../utils/tableColumns'
import type { ModelRow } from '../utils/modelCompare'
import {
  FIRE_UNAVAILABLE_NOTE,
  FIRE_UNCOVERED_NOTE,
  FireWarning,
  fireCellText,
  fireLoadingFrame,
  fireWarningText,
} from '../utils/fireProximity'
import type { FireProximityStatus } from '../hooks/useFireProximity'
import { FREEZE_UNAVAILABLE_NOTE, isFreezeKey } from '../utils/freezingLevel'
import { isUnavailableKey, unavailableCellText } from '../utils/unavailableCell'
import { isSnowDepthKey, snowCellText } from '../utils/snowCeiling'
import { destinationUrl } from '../utils/destinationUrl'
import { extremeHourMs, windyUrl } from '../utils/windy'
import { FIRE_LINK_ZOOM, nifcFireUrl } from '../utils/wildfires'
import { isPeakKind } from '../utils/geocode'
import type { PendingDestination } from '../utils/customList'
import { geoKey } from '../utils/points'
import { CHOICE_INPUT, ICON_ACTION, LINK_ACTION, TABLE, TEXT } from '../styles'
import { IconClose, IconExternalLink } from './icons'
import ResultsTableHeader, { sized } from './ResultsTableHeader'

// The number cell that swaps to the remove × on row hover (touch devices show
// both — the row-remove rule in index.css). `rank` is "—" for pending rows.
// Both faces sit in one grid cell (TABLE.rankStack) so the column never
// changes width when they trade places; see the role's comment.
function RankRemoveCell({ rank, name, onRemove }: { rank: string; name: string; onRemove?: () => void }) {
  return (
    <td className={`${TABLE.cell} tabular-nums whitespace-nowrap`}>
      {onRemove ? (
        <span className={TABLE.rankStack}>
          <span className={`${TEXT.caption} ${TABLE.rankFace} group-hover:invisible`}>{rank}</span>
          <button
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className={`row-remove ${TABLE.rankFace} invisible group-hover:visible leading-none ${ICON_ACTION} cursor-pointer`}
          >
            <IconClose />
          </button>
        </span>
      ) : (
        <span className={TEXT.caption}>{rank}</span>
      )}
    </td>
  )
}

interface Props {
  // Already in display order: App applies the detail-column sort below before
  // handing these over, so the rows arrive as they are drawn.
  results: DestinationResult[]
  // Rows that are leaving the display via a live presentation knob, to be
  // faded out rather than removed instantly. Empty when not animating.
  leavingRowKeys: Set<string>
  // Why the table has no rows, when it has none. Rendered as a row under the
  // headers rather than above the table, so an empty report still reads as a
  // table that found nothing rather than as a notice with a table beneath it.
  emptyReason?: string | null
  // The ranking the displayed rows are already in. Live on the client path,
  // where the panel re-derives the rows from the held field on every change.
  sortBy: SortBy
  // The detail-column sort: which non-ranking column the rows are read in, and
  // which way. Held by App rather than here since #125, because the CSV export
  // has to leave in the order that is on screen, and a component that keeps its
  // own display order privately is the one thing that can contradict
  // present.ts's promise that a single place answers what the table shows.
  detailSortKey: SortKey
  detailSortDir: SortDir
  onDetailSort: (key: SortKey, dir: SortDir) => void
  // Derived from the analyzed snapshot's window, unlike sortBy/sortDesc: an
  // analysis covering one hourly stamp shows one column per metric instead of
  // the avg/min/max triplets, and no knob can change that without a new
  // analysis.
  pointSample?: boolean
  // Columns to display, filtered by user visibility choices. The file always
  // carries the full set via buildResultsCsv; only the screen narrows.
  columns?: ColDef[]
  // What the Model column reads for a row no comparison tagged: the model the
  // analysis itself ran. The column can be shown with one model selected
  // (it is in the Columns picker), and a dash there would say the row came
  // from nowhere.
  modelFallbackLabel?: string | null
  // Center the map on a destination that has no forecast yet. Separate from
  // `onFocusResult` because there is no result to pass: a pending row is a
  // coordinate and a name, and the popup the ranked version opens is built
  // from numbers this row does not have.
  onFocusPending?: (at: { latitude: number; longitude: number }) => void
  // Which forecast model the rows came from, so a metric cell can ask Windy
  // for the same one. A compared row carries its own and wins over this.
  modelId?: string | null
  // The hourly grid the rows' series are aligned to, epoch ms. A floor or a
  // ceiling names one hour of it, and the Windy link opens on that hour.
  times?: readonly number[]
  // Move one column to where another sits. Absent means the header does not
  // reorder — the CSV-only and pre-analysis renders pass nothing.
  onColumnMove?: (fromKey: string, toKey: string) => void
  fireWarnings: Map<string, FireWarning>
  // Rows the fire dataset could not see (outside its US coverage, #256).
  // Their Wildfire (mi) cells read "N/A", where a cleared check prints the
  // dash, so a missing warning is never mistaken for a clear one.
  fireUncovered: Set<string>
  // The lookup's own state. The Wildfire (mi) column is always on screen, so
  // its cells have to say when they are still waiting (a ticking ellipsis)
  // versus answered — a column that appeared only on 'ready' looked like the
  // table quietly growing a column moments after every analysis.
  fireStatus: FireProximityStatus
  // Custom destinations awaiting their first analysis — pasted CSV rows and
  // searched places alike — shown immediately as un-forecasted rows (name +
  // elevation, "—" metrics) so both inputs have feedback before Analyze runs.
  pending?: PendingDestination[]
  // Absent for a CSV row: its truth is the textarea text, so it is removed by
  // editing that, not by an × here.
  onRemovePending?: (d: PendingDestination) => void
  // The × that replaces a row's rank number on hover — removes the destination
  // from the current report (and, for a searched place, deregisters it).
  onRemove?: (row: DestinationResult) => void
  // Clicking a row's name centers the map on that destination.
  onFocusResult?: (row: DestinationResult) => void
  // Chart selection. When onToggleChart is provided (the analysis carried
  // series), each ranked row with series gets a checkbox that toggles it on the
  // comparison chart, its accent tinted with the destination's line color.
  onToggleChart?: (row: DestinationResult) => void
  isCharted?: (row: DestinationResult) => boolean
  chartColor?: (row: DestinationResult) => string
  // Shift-click range select: (de)select every chartable row in the run,
  // matching the checked state the click produces.
  onChartRange?: (rows: DestinationResult[], selected: boolean) => void
  // Column widths the user has set (px by column key), held by App so they
  // survive mode switches and the collapse chevron. A column absent from the
  // map keeps its natural width — see utils/columnResize.ts for the model.
  columnWidths?: Record<string, number>
  onColumnWidthsChange?: (widths: Record<string, number>) => void
}

function ResultsTable({
  results,
  leavingRowKeys,
  emptyReason,
  sortBy,
  detailSortKey,
  detailSortDir,
  onDetailSort,
  pointSample = false,
  columns,
  modelFallbackLabel,
  onFocusPending,
  modelId,
  times,
  onColumnMove,
  fireWarnings,
  fireUncovered,
  fireStatus,
  pending,
  onRemovePending,
  onRemove,
  onFocusResult,
  onToggleChart,
  isCharted,
  chartColor,
  onChartRange,
  columnWidths,
  onColumnWidthsChange,
}: Props) {
  const coloredGroup = new Set<string>(FAMILY_KEYS[familyOf(sortBy)])
  // The ranked metric's columns lead the table (right after #/Name/Elevation), so
  // the numbers the ranking was built from are the first thing read. Keyed on
  // the analyzed snapshot, like the cell colors — panel knob changes don't
  // reshuffle the displayed report. Defaults to all columns if none provided.
  const orderedColumns = useMemo(
    () => columns ?? displayedColumns(pointSample, sortBy),
    [columns, pointSample, sortBy],
  )

  // Shift-click range select: the checkbox last interacted with is the anchor;
  // a shift-held click extends (de)selection to every chartable row between.
  const shiftHeldRef = useRef(false)
  const anchorRef = useRef<string | null>(null)

  // The wildfire cells' shared clock while the fire check is in flight. One
  // ticking state for the whole table rather than per cell, so every cell
  // shows the same frame; the interval exists only while there is something
  // to wait for, and 'idle' animates too because it is what the hook reports
  // for the one render before its effect has run.
  const fireLoading = fireStatus === 'idle' || fireStatus === 'loading'
  const [fireTick, setFireTick] = useState(0)
  useEffect(() => {
    if (!fireLoading) return
    const id = setInterval(() => setFireTick((t) => t + 1), 400)
    return () => clearInterval(id)
  }, [fireLoading])

  // The leading checkbox column only appears once an analysis has returned
  // series to chart; rows without series (e.g. pinned search forecasts) render
  // an empty cell so the columns stay aligned.
  const showChartCol = !!onToggleChart

  // Every chartable row currently in the table, for the header "select all"
  // box. Its state (all/some/none) drives both the checked mark and the
  // indeterminate dash.
  // Memoized, with the columns above, because the header is memoized on them:
  // a fresh array on every tick of the wildfire clock would redraw it.
  const chartableRows = useMemo(
    () => (showChartCol ? results.filter((r) => r.series) : []),
    [showChartCol, results],
  )
  const headState = selectionState(chartableRows, (r) => isCharted?.(r) ?? false)

  // Every data cell is sized by the same widths the header resizes.
  const widths = columnWidths ?? {}
  const tableRef = useRef<HTMLTableElement>(null)

  function handleChartToggle(row: DestinationResult) {
    const shift = shiftHeldRef.current
    shiftHeldRef.current = false
    const anchor = anchorRef.current
    anchorRef.current = chartKey(row)

    if (shift && anchor && onChartRange) {
      // Apply the state this click produces (select or clear) to the whole run,
      // in the current display order — what the user sees between the two boxes.
      const range = rowsBetween(results, anchor, chartKey(row)).filter((r) => r.series)
      if (range.length > 0) {
        onChartRange(range, !(isCharted?.(row) ?? false))
        return
      }
    }
    onToggleChart?.(row)
  }

  // Rendered for every row, series or not: a pending row's box pre-selects it
  // (and shows its sticky color) so the line appears the moment an analysis
  // gives it data. Only the shift-range path insists on series rows.
  function renderChartToggle(row: DestinationResult) {
    if (!onToggleChart) return null
    const on = isCharted?.(row) ?? false
    return (
      <input
        type="checkbox"
        checked={on}
        onClick={(e) => {
          shiftHeldRef.current = e.shiftKey
        }}
        onChange={() => handleChartToggle(row)}
        aria-label={`Chart ${row.name}`}
        className={CHOICE_INPUT}
        style={on && chartColor ? { accentColor: chartColor(row) } : undefined}
      />
    )
  }

  // Everything after the rank cell, shared by ranked rows and the pinned row
  // so the searched point gets identical formatting, links, and cell colors.
  function rowCells(row: DestinationResult) {
    return orderedColumns.map((col) => {
      // Before anything indexes the row: the wildfire column's key is virtual,
      // its value living in the fire lookup rather than on the row. While the
      // check is in flight every cell ticks the shared dots, muted to caption
      // type so a whole column of them reads as waiting rather than data. A
      // failed check marks every row N/A — the same mark as an uncovered row,
      // because both mean "no answer for this row" — and the hover text is
      // what tells the two causes apart. A warned cell carries the fire's
      // name — this is the flag's only home, so the label lives here rather
      // than beside the row's name. `title` is the hover text (the app's
      // idiom, see ForecastCalendar); `aria-label` is the same sentence for
      // a screen reader.
      if (col.key === WILDFIRE_KEY) {
        const warning = fireWarnings.get(geoKey(row.latitude, row.longitude))
        const uncovered = fireUncovered.has(geoKey(row.latitude, row.longitude))
        const note =
          fireStatus === 'unavailable'
            ? FIRE_UNAVAILABLE_NOTE
            : fireStatus === 'ready' && warning
              ? fireWarningText(warning)
              : fireStatus === 'ready' && uncovered
                ? FIRE_UNCOVERED_NOTE
                : null
        const text =
          fireStatus === 'unavailable' ? 'N/A' : fireCellText(warning, uncovered)
        return (
          <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono`}>
            {sized(
              widths,
              col.key,
              fireLoading ? (
                <span className={TEXT.caption}>{fireLoadingFrame(fireTick)}</span>
              ) : warning ? (
                // A warned cell links to the fire it is warning about, the same
                // NIFC map a clicked fire on the map opens (TJ, 2026-09-14).
                // The hover text goes with it: the link is the better answer to
                // "what is this", and a tooltip does not exist on touch anyway.
                <a
                  href={nifcFireUrl(warning.longitude, warning.latitude, FIRE_LINK_ZOOM)}
                  target="_blank"
                  rel="noopener noreferrer"
                  // The cell reads "⚠️ 3.2", which unlabelled announces as
                  // "link, warning three point two". The label names the fire
                  // and where it goes, in the shape every other link in this
                  // table uses (accessibility.test.ts pins the tail).
                  aria-label={`Open ${warning.name} on the NIFC map. Opens in a new tab.`}
                  className="hover:underline cursor-pointer"
                >
                  {text}
                </a>
              ) : note ? (
                // The two unlinked states keep theirs: N/A means either "never
                // checked here" or "the check failed", and the hover text is
                // the only thing that says which.
                <span title={note} aria-label={note} className="cursor-help">
                  {text}
                </span>
              ) : (
                text
              ),
            )}
          </td>
        )
      }
      // Which model answered this row, when more than one did. Virtual like
      // the wildfire column: the value rides beside the row rather than on it.
      if (col.key === MODEL_KEY) {
        return (
          <td key={col.key} className={`${TABLE.cell} whitespace-nowrap`}>
            {sized(widths, col.key, (row as ModelRow).modelLabel ?? modelFallbackLabel ?? '—')}
          </td>
        )
      }
      const raw = row[col.key]
      // Two metrics can decline to answer for a reason that is not the
      // weather: the model publishes no freezing level, or the destination is
      // outside the snow grid. An empty cell in either is not a gap in the
      // forecast, so it wears the wildfire column's N/A idiom rather than the
      // dash a missing AQI hour gets.
      //
      // Only one of them has a cause a reader can act on, and so only one
      // carries hover text: the model is a control in the panel, where a
      // destination's place on the map is not (TJ, 2026-09-22).
      const missing = isUnavailableKey(col.key as string) ? unavailableCellText(raw) : null
      if (missing !== null) {
        const cause = isFreezeKey(col.key as string) ? FREEZE_UNAVAILABLE_NOTE : undefined
        return (
          <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono`}>
            {sized(
              widths,
              col.key as string,
              <span
                title={cause}
                aria-label={cause}
                className={cause ? 'cursor-help' : undefined}
              >
                {missing}
              </span>,
            )}
          </td>
        )
      }
      // A depth the source file could not hold prints as "at least" rather
      // than as the ceiling it was clipped to. Everything else about the cell
      // is unchanged: it keeps its colour band, its link and its rank.
      const display =
        (isSnowDepthKey(col.key as string) ? snowCellText(raw) : null) ??
        (col.format ? col.format(raw) : String(raw ?? '—'))
      // Each colored cell scores the number printed in it, against the scale
      // its own column is measured on. It used to score the *ranked* value
      // instead, so the whole group came out one flat color and the spread the
      // extra columns exist to show was the one thing the color could not say.
      const scale = coloredGroup.has(col.key as string)
        ? scaleFor(col.key as string, pointSample)
        : null
      // Color comes from the table's own base, or inline from cellStyle for a
      // ranked column — an inline color beats the inherited one either way.
      const cellClass = `${TABLE.cell} whitespace-nowrap ${
        col.key === 'name' ? 'font-sans font-medium' : 'font-mono'
      }`
      const colorSty = scale && raw != null ? cellStyle(raw as number, scale) : undefined

      if (col.key === 'name') {
        return (
          <td key={col.key} className={cellClass}>
            {sized(
              widths,
              'name',
              <span className="flex min-w-0 items-center gap-1.5">
                <button
                  onClick={() => onFocusResult?.(row)}
                  aria-label={`Center map on ${row.name}`}
                  className={`${LINK_ACTION} min-w-0 cursor-pointer truncate text-left`}
                >
                  {display}
                </button>
                <a
                  href={destinationUrl(row)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${row.name} in an external map. Opens in a new tab.`}
                  className={`shrink-0 ${ICON_ACTION}`}
                >
                  <IconExternalLink />
                </a>
              </span>,
            )}
          </td>
        )
      }

      if (col.windyLayer) {
        // The model this row's numbers came from, and the hour this cell's
        // number came from. A compared row names its own model, which is the
        // whole point of the Model column beside it.
        const rowModel = (row as ModelRow).modelId ?? modelId
        const at = extremeHourMs(
          col.key as string,
          row.series,
          row.series_times ?? times ?? [],
        )
        return (
          <td key={col.key} className={cellClass} style={colorSty}>
            {sized(
              widths,
              col.key as string,
              <a
                href={windyUrl({
                  latitude: row.latitude,
                  longitude: row.longitude,
                  layer: col.windyLayer,
                  modelId: rowModel,
                  atMs: at,
                })}
                target="_blank"
                rel="noopener noreferrer"
                // The link text is the measurement itself, so unlabelled this
                // announces as "link, 0.0000". The label names the destination
                // and the site, never the layer: a layer name would be a metric
                // spelled at a call site, which metrics.test.ts forbids.
                aria-label={`Open ${row.name} on Windy. Opens in a new tab.`}
                className={"hover:underline cursor-pointer"}
              >
                {display}
              </a>,
            )}
          </td>
        )
      }

      return (
        <td key={col.key} className={cellClass} style={colorSty}>
          {sized(widths, col.key as string, display)}
        </td>
      )
    })
  }

  return (
    // No overflow here — the panel's scroll container in App.tsx owns both
    // axes so the horizontal scrollbar stays pinned to the visible bottom.
    <div>
      {/* The table's base type is set once here so every cell inherits it and
          only the ranked columns' inline colors override. */}
      <table ref={tableRef} className={`min-w-full ${TEXT.control}`}>
        <ResultsTableHeader
          columns={orderedColumns}
          detailSortKey={detailSortKey}
          detailSortDir={detailSortDir}
          onDetailSort={onDetailSort}
          onColumnMove={onColumnMove}
          columnWidths={columnWidths}
          onColumnWidthsChange={onColumnWidthsChange}
          tableRef={tableRef}
          showChartCol={showChartCol}
          chartableRows={chartableRows}
          headState={headState}
          onChartRange={onChartRange}
        />
        <tbody>
          {pending?.map((d) => (
            <tr
              key={`pending-${d.latitude},${d.longitude}`}
              className={TABLE.row}
            >
              {showChartCol && (
                <td className={TABLE.cell}>
                  {renderChartToggle({
                    name: d.name,
                    latitude: d.latitude,
                    longitude: d.longitude,
                  } as DestinationResult)}
                </td>
              )}
              <RankRemoveCell
                rank="—"
                name={d.name}
                onRemove={
                  onRemovePending && d.source === 'search' ? () => onRemovePending(d) : undefined
                }
              />
              {orderedColumns.map((col) => {
                if (col.key === 'name') {
                  return (
                    <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-sans font-medium`}>
                      {sized(
                        widths,
                        'name',
                        <span className="flex min-w-0 items-center gap-1.5">
                          {/* The same fly-to a ranked row's name gives, and
                              for the same reason: the dot is already on the
                              map, so there is nothing an analysis adds to the
                              ability to look at it (TJ, 2026-09-14). No popup
                              follows it, unlike a ranked row's: a popup here
                              would be a forecast card with no forecast in it,
                              and clicking the dot already says what is known. */}
                          <button
                            onClick={() =>
                              onFocusPending?.({ latitude: d.latitude, longitude: d.longitude })
                            }
                            aria-label={`Center map on ${d.name}`}
                            className={`${LINK_ACTION} min-w-0 cursor-pointer truncate text-left`}
                          >
                            {d.name}
                          </button>
                        <a
                          href={destinationUrl({
                            name: d.name,
                            type: isPeakKind(d.kind ?? '') ? 'peak' : 'custom',
                            osm_id: d.osmId ?? null,
                            latitude: d.latitude,
                            longitude: d.longitude,
                          } as DestinationResult)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${d.name} in an external map. Opens in a new tab.`}
                          className={`shrink-0 ${ICON_ACTION}`}
                        >
                          <IconExternalLink />
                        </a>
                        </span>,
                      )}
                    </td>
                  )
                }
                if (col.key === 'elevation_ft') {
                  return (
                    <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono`}>
                      {sized(widths, 'elevation_ft', d.elevation_ft != null ? d.elevation_ft.toLocaleString() : '—')}
                    </td>
                  )
                }
                return (
                  <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono ${TEXT.caption}`}>
                    {sized(widths, col.key as string, '—')}
                  </td>
                )
              })}
              <td aria-hidden="true" className="p-0" />
            </tr>
          ))}
          {results.map((row, i) => {
            const isLeaving = leavingRowKeys.has(geoKey(row.latitude, row.longitude))
            return (
            <tr
              key={`${row.name}-${i}`}
              className={`${TABLE.row} ${isLeaving ? 'animate-remove-row' : ''}`}
            >
              {showChartCol && <td className={TABLE.cell}>{renderChartToggle(row)}</td>}
              <RankRemoveCell
                // The destination's own rank when a comparison repeats it down
                // several rows, and the display position otherwise, which is
                // what the two are when a destination has one row.
                rank={String((row as ModelRow).rank ?? i + 1)}
                name={row.name}
                onRemove={onRemove ? () => onRemove(row) : undefined}
              />
              {rowCells(row)}
              <td aria-hidden="true" className="p-0" />
            </tr>
            )
          })}
          {emptyReason && results.length === 0 && (pending?.length ?? 0) === 0 && (
            <tr>
              {/* The cell spans the table, which is wider than the panel once
                  the columns overflow, so centring inside it would push the
                  sentence off the right edge behind a sideways scroll through
                  columns of nothing. The inner block is pinned to the scroll
                  container's left edge and sized to its VISIBLE width in
                  container units, so it stays centred on what the reader can
                  see at any scroll offset. */}
              <td colSpan={orderedColumns.length + (showChartCol ? 2 : 1) + 1} className="p-0">
                <div className={`sticky left-0 w-[100cqi] px-4 py-3 text-center ${TEXT.helper}`}>
                  {emptyReason}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Memoized because App.tsx re-renders on any of its 50-odd pieces of state, and
// most of them cannot change what this component draws. Measured 2026-09-14 on
// a 946-destination analysis: toggling a map overlay, which touches neither the
// ranking nor the rows, cost 311 to 392 ms of synchronous React work, because
// the table and the chart both re-rendered for it. Every function prop this
// takes is wrapped in `useCallback` at the call site or in its hook; a fresh
// identity there puts the whole cost straight back (#337, finding 8).
export default memo(ResultsTable)
