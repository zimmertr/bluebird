import { useRef } from 'react'
import type { ReactNode } from 'react'
import { DestinationResult, SortBy } from '../types'
import { cellStyle, scaleFor, METRIC_CONFIG } from '../utils/colors'
import { chartKey, rowsBetween, selectionState } from '../utils/chartData'
import { SortDir, SortKey, displayedColumns, ColDef } from '../utils/tableColumns'
import { autoFitWidth, dragWidth } from '../utils/columnResize'
import { FireWarning, fireKey, fireWarningText } from '../utils/fireProximity'
import { destinationUrl } from '../utils/destinationUrl'
import { isPeakKind } from '../utils/geocode'
import type { PendingDestination } from '../utils/customList'
import { pinKey } from '../utils/customList'
import { ACCENT, CHOICE_INPUT, ICON_ACTION, LINK_ACTION, TABLE, TEXT } from '../styles'
import { RANKING_KEYS } from '../metrics'

function windyUrl(lat: number, lon: number, layer: string): string {
  return `https://www.windy.com/?${layer},${lat.toFixed(4)},${lon.toFixed(4)},11`
}

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// The number cell that swaps to the remove × on row hover (touch devices show
// both — the row-remove rule in index.css). `rank` is "—" for pending rows.
function RankRemoveCell({ rank, name, onRemove }: { rank: string; name: string; onRemove?: () => void }) {
  return (
    <td className={`${TABLE.cell} tabular-nums whitespace-nowrap`}>
      {onRemove ? (
        <>
          <span className={`${TEXT.caption} group-hover:hidden`}>{rank}</span>
          <button
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className={`row-remove hidden group-hover:inline leading-none ${ICON_ACTION} cursor-pointer`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
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
  sortDesc: boolean
  // Re-rank the whole field by one of the four ranking metrics. Absent on the
  // server path, which holds no field to re-rank, so a header click there falls
  // back to reordering the rows on screen.
  onRank?: (key: SortBy, desc: boolean) => void
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
  fireWarnings: Map<string, FireWarning>
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

export default function ResultsTable({
  results,
  leavingRowKeys,
  emptyReason,
  sortBy,
  sortDesc,
  onRank,
  detailSortKey,
  detailSortDir,
  onDetailSort,
  pointSample = false,
  columns,
  fireWarnings,
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
  const coloredGroup = new Set(METRIC_CONFIG[sortBy].group)
  // The ranked metric's columns lead the table (right after #/Name/Elevation), so
  // the numbers the ranking was built from are the first thing read. Keyed on
  // the analyzed snapshot, like the cell colors — panel knob changes don't
  // reshuffle the displayed report. Defaults to all columns if none provided.
  const orderedColumns = columns ?? displayedColumns(pointSample, sortBy)

  // Shift-click range select: the checkbox last interacted with is the anchor;
  // a shift-held click extends (de)selection to every chartable row between.
  const shiftHeldRef = useRef(false)
  const anchorRef = useRef<string | null>(null)

  // A header click means "rank by this", and for the four metrics that are also
  // ranking keys it can mean it literally: `onRank` re-cuts the whole held field,
  // so clicking Wind gives the least windy destinations in the area rather than
  // the driest ones reordered by wind. The remaining columns are detail, and
  // reorder the rows on screen as they always have. Widening the ranking
  // vocabulary to cover them needs marker thresholds, a URL spelling and an
  // aggregate-aware header noun per key, which is a separate change (see
  // RANKING_KEYS in metrics.ts).
  //
  // Column ORDER keys off the ranking metric and not its direction, so toggling
  // ascending/descending never moves the header out from under the cursor;
  // switching metric does move it, which is the report changing shape.
  function handleSort(key: SortKey) {
    if (onRank && (RANKING_KEYS as readonly string[]).includes(key)) {
      onRank(key as SortBy, key === sortBy ? !sortDesc : false)
      return
    }
    onDetailSort(key, key === detailSortKey && detailSortDir === 'asc' ? 'desc' : 'asc')
  }

  // The leading checkbox column only appears once an analysis has returned
  // series to chart; rows without series (e.g. pinned search forecasts) render
  // an empty cell so the columns stay aligned.
  const showChartCol = !!onToggleChart

  // Every chartable row currently in the table, for the header "select all"
  // box. Its state (all/some/none) drives both the checked mark and the
  // indeterminate dash.
  const chartableRows = showChartCol ? results.filter((r) => r.series) : []
  const headState = selectionState(chartableRows, (r) => isCharted?.(r) ?? false)

  // ---- Column resizing. The arithmetic lives in utils/columnResize.ts; this
  // block is only the DOM: where the pointer is, how wide a header's content
  // renders, and which cells belong to a column.
  const widths = columnWidths ?? {}
  const widthsRef = useRef(widths)
  widthsRef.current = widths
  const tableRef = useRef<HTMLTableElement>(null)

  // A column's content width: the header's box minus its own padding, which
  // under auto layout is the width the widest cell has forced on the column.
  function thContentWidth(th: HTMLElement): number {
    const cs = getComputedStyle(th)
    return th.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  }

  function beginColumnResize(e: React.PointerEvent, key: string) {
    if (!onColumnWidthsChange) return
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement
    const start = widthsRef.current[key] ?? thContentWidth(th)
    const startX = e.clientX
    const onMove = (ev: PointerEvent) =>
      onColumnWidthsChange({ ...widthsRef.current, [key]: dragWidth(start, ev.clientX - startX) })
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // Double-click on a handle: fit the longest cell. scrollWidth alone cannot
  // answer this — the name cell truncates through flex, which SHRINKS content
  // to the wrapper instead of overflowing it, so a clipped wrapper reports its
  // own width back. Instead every wrapper is let out to max-content for one
  // synchronous layout, measured, and restored; two reflows per double-click.
  function autoFitColumn(e: React.MouseEvent, key: string) {
    if (!onColumnWidthsChange || !tableRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLTableCellElement
    const body = tableRef.current.tBodies[0]
    const cells: HTMLElement[] = [th]
    for (const row of body ? Array.from(body.rows) : []) {
      const cell = row.cells[th.cellIndex]
      if (cell) cells.push(cell)
    }
    const inners = cells.map((c) => c.querySelector<HTMLElement>('[data-col-inner]'))
    const saved = inners.map((el) => el?.style.width ?? '')
    inners.forEach((el) => {
      if (el) el.style.width = 'max-content'
    })
    // Fractional widths, deliberately: the integer scroll metrics round, and
    // a fit that rounds first and pads after made the first double-click
    // widen a column that already fit. autoFitWidth ceils once, at the end.
    // Cells without a wrapper (none today) fall back to their own box.
    const contents = cells.map((c, i) => {
      const inner = inners[i]
      if (inner) return inner.getBoundingClientRect().width
      const cs = getComputedStyle(c)
      return c.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    })
    inners.forEach((el, i) => {
      if (el) el.style.width = saved[i]
    })
    onColumnWidthsChange({ ...widthsRef.current, [key]: autoFitWidth(contents) })
  }

  // Every data cell renders inside this wrapper. Sized, it pins the cell's
  // content box to the chosen width; unsized it is inert — but it must exist
  // either way, because it is what auto-fit measures. Measuring the cell
  // itself reads the STRETCHED box (auto layout hands min-w-full's spare
  // space to every column), which made the first double-click widen columns
  // that already fit their content.
  //
  // The clipping classes ride ONLY with a width. On an unsized column a
  // truncatable block stops defending its content in auto table layout — the
  // column can be dealt less than its own header, which then renders
  // pre-clipped and makes the first fit look like it widened the column when
  // it merely un-clipped it.
  function sized(key: string, content: ReactNode, display: 'block' | 'inline' = 'block'): ReactNode {
    const w = widths[key]
    const clip = w !== undefined ? 'overflow-hidden text-ellipsis' : ''
    // Inline for headers: the sort arrow renders BESIDE this wrapper, outside
    // any pinned width, so a column fitted before it was ranked does not clip
    // its own label when the arrow arrives — the column grows by the arrow.
    const flow = display === 'inline' ? 'inline-block align-bottom' : ''
    const className = `${clip} ${flow}`.trim()
    return (
      <div
        data-col-inner
        className={className || undefined}
        style={w !== undefined ? { width: w } : undefined}
      >
        {content}
      </div>
    )
  }

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
      const raw = row[col.key]
      const display = col.format ? col.format(raw) : String(raw ?? '—')
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
        const warning = fireWarnings.get(fireKey(row.latitude, row.longitude))
        return (
          <td key={col.key} className={cellClass}>
            {sized(
              'name',
              <span className="flex min-w-0 items-center gap-1.5">
                {warning && (
                  <span
                    aria-label={fireWarningText(warning)}
                    className="cursor-help"
                  >
                    ⚠️
                  </span>
                )}
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
                  aria-label={`Open ${row.name} in an external map`}
                  className={`shrink-0 ${ICON_ACTION}`}
                >
                  <ExternalLinkIcon />
                </a>
              </span>,
            )}
          </td>
        )
      }

      if (col.windyLayer) {
        return (
          <td key={col.key} className={cellClass} style={colorSty}>
            {sized(
              col.key as string,
              <a
                href={windyUrl(row.latitude, row.longitude, col.windyLayer)}
                target="_blank"
                rel="noopener noreferrer"
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
          {sized(col.key as string, display)}
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
        <thead className="sticky top-0 bg-slate-700 z-10">
          <tr>
            {showChartCol && (
              <th className={`${TABLE.head} w-6`}>
                {onChartRange && chartableRows.length > 0 && (
                  <input
                    type="checkbox"
                    checked={headState === 'all'}
                    ref={(el) => {
                      // `indeterminate` is a DOM property, not an attribute, so
                      // React can't set it via a prop — sync it on every render.
                      if (el) el.indeterminate = headState === 'some'
                    }}
                    onChange={() => onChartRange(chartableRows, headState !== 'all')}
                    aria-label="Chart all destinations"
                    className={CHOICE_INPUT}
                  />
                )}
              </th>
            )}
            <th scope="col" className={`${TABLE.head} w-6`}>#</th>
            {orderedColumns.map((col) => (
              <th
                key={col.key}
                scope="col"
                data-col={col.key}
                aria-sort={detailSortKey === col.key ? (detailSortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => handleSort(col.key)}
                className={`${TABLE.head} relative cursor-pointer whitespace-nowrap hover:text-white select-none`}
              >
                {sized(col.key as string, col.label, 'inline')}
                {detailSortKey === col.key && (
                  <span className={`ml-1 ${ACCENT.text}`}>{detailSortDir === 'asc' ? '↑' : '↓'}</span>
                )}
                {/* The drag handle owns the header's right edge; its clicks
                    stop here so a resize or an auto-fit never doubles as a
                    sort. The border is the visible affordance. */}
                {onColumnWidthsChange && (
                  <span
                    onPointerDown={(e) => beginColumnResize(e, col.key as string)}
                    onDoubleClick={(e) => autoFitColumn(e, col.key as string)}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none border-r-2 border-slate-500/40 ${ACCENT.edgeHover}`}
                    aria-hidden="true"
                  />
                )}
              </th>
            ))}
            {/* The filler column soaks up min-w-full's spare width. Without
                it auto layout deals that space to every column, so a fitted
                or dragged column renders wider than the width it was given
                and a first double-click reads as "the column grew". */}
            <th aria-hidden="true" className="w-full p-0" />
          </tr>
        </thead>
        <tbody>
          {pending?.map((d) => (
            <tr
              key={`pending-${d.latitude},${d.longitude}`}
              className="group border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
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
                        'name',
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate">{d.name}</span>
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
                          aria-label={`Open ${d.name} in an external map`}
                          className={`shrink-0 ${ICON_ACTION}`}
                        >
                          <ExternalLinkIcon />
                        </a>
                        </span>,
                      )}
                    </td>
                  )
                }
                if (col.key === 'elevation_ft') {
                  return (
                    <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono`}>
                      {sized('elevation_ft', d.elevation_ft != null ? d.elevation_ft.toLocaleString() : '—')}
                    </td>
                  )
                }
                return (
                  <td key={col.key} className={`${TABLE.cell} whitespace-nowrap font-mono ${TEXT.caption}`}>
                    {sized(col.key as string, '—')}
                  </td>
                )
              })}
              <td aria-hidden="true" className="p-0" />
            </tr>
          ))}
          {results.map((row, i) => {
            const isLeaving = leavingRowKeys.has(pinKey(row.latitude, row.longitude))
            return (
            <tr
              key={`${row.name}-${i}`}
              className={`group border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors ${isLeaving ? 'animate-remove-row' : ''}`}
            >
              {showChartCol && <td className={TABLE.cell}>{renderChartToggle(row)}</td>}
              <RankRemoveCell
                rank={String(i + 1)}
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
