import { createContext, memo, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DestinationResult } from '../types'
import { MODEL_KEY, WILDFIRE_KEY, type ColDef } from '../utils/tableColumns'
import { fireLoadingFrame, type FireProximityStatus, type FireWarning } from '../utils/fireProximity'
import type { ChartBox } from '../hooks/useChartBox'
import { destinationUrl } from '../utils/destinationUrl'
import { FIRE_LINK_ZOOM, nifcFireUrl } from '../utils/wildfires'
import type { PendingDestination } from '../utils/customList'
import { isPartialRow } from '../utils/modelCompare'
import {
  cellColor,
  cellText,
  fireCell,
  modelCellText,
  pendingChartRow,
  pendingLinkRow,
  unavailableCell,
  windyCellUrl,
} from '../utils/resultsCells'
import { CHOICE_INPUT, ICON_ACTION, LINK_ACTION, TABLE, TEXT } from '../styles'
import { IconClose, IconExternalLink } from './icons'
import { sized } from './sizedCell'

// One body row of the results table, ranked or pending. Apart from the table
// and memoized because a report can hold a thousand rows and most changes to
// the table touch few of them: a chart toggle changes one row's box, and a
// live cut fades a handful out. Every prop is a primitive, a value the table
// memoizes, or a callback whose identity the table holds still, so a row
// whose own inputs did not move is skipped.

// The number cell that swaps to the remove × on row hover (touch devices show
// both, the row-remove rule in index.css). `rank` is "—" for pending rows.
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

// Rendered for every row, series or not: a pending row's box pre-selects it
// (and shows its sticky color) so the line appears the moment an analysis
// gives it data. Only the shift-range path insists on series rows.
function ChartToggle({ row, on, color, box }: { row: DestinationResult; on: boolean; color?: string; box: ChartBox }) {
  return (
    <td className={TABLE.cell}>
      <input
        type="checkbox"
        checked={on}
        onClick={(e) => box.onShift(e.shiftKey)}
        onChange={() => box.onToggle(row)}
        aria-label={`Chart ${row.name}`}
        className={CHOICE_INPUT}
        style={on && color ? { accentColor: color } : undefined}
      />
    </td>
  )
}

// The wildfire cells' shared clock while the fire check is in flight: one
// ticking state for the whole table rather than per cell, so every cell shows
// the same frame, and an interval only while there is something to wait for.
// The frame reaches the cells through a context rather than a row prop,
// because it ticks every 400 ms: as a prop it would redraw every cell of every
// row per tick, where a context redraws only the wildfire cells that read it.
// Null once the check has answered.
const FireFrame = createContext<string | null>(null)

export function FireClock({ running, children }: { running: boolean; children: ReactNode }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((t) => t + 1), 400)
    return () => clearInterval(id)
  }, [running])
  return <FireFrame.Provider value={running ? fireLoadingFrame(tick) : null}>{children}</FireFrame.Provider>
}

// A destination's name: the fly-to button and the external map link. `label`
// is the printed text and `name` the one the accessible labels read.
interface NameTdProps {
  cellClass: string
  widths: Record<string, number>
  label: string
  name: string
  onCenter: () => void
  href: string
}

function NameTd({ cellClass, widths, label, name, onCenter, href }: NameTdProps) {
  return (
    <td className={cellClass}>
      {sized(
        widths,
        'name',
        <span className="flex min-w-0 items-center gap-1.5">
          <button
            onClick={onCenter}
            aria-label={`Center map on ${name}`}
            className={`${LINK_ACTION} min-w-0 cursor-pointer truncate text-left`}
          >
            {label}
          </button>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${name} in an external map. Opens in a new tab.`}
            className={`shrink-0 ${ICON_ACTION}`}
          >
            <IconExternalLink />
          </a>
        </span>,
      )}
    </td>
  )
}

interface CellContext {
  widths: Record<string, number>
  coloredGroup: ReadonlySet<string>
  pointSample: boolean
  modelFallbackLabel?: string | null
  modelId?: string | null
  times?: readonly number[]
  fireStatus: FireProximityStatus
  fireWarning?: FireWarning
  fireUncovered: boolean
  // Centres the map on the row: the name button's fly-to.
  onCenter: () => void
}

// The wildfire column's key is virtual, its value living in the fire lookup
// rather than on the row. While the check is in flight every cell ticks the
// shared dots, muted to caption type so a whole column of them reads as
// waiting rather than data. A warned cell carries the fire's name: this is the
// flag's only home, so the label lives here rather than beside the row's name.
function FireTd({ colKey, ctx }: { colKey: string; ctx: CellContext }) {
  const frame = useContext(FireFrame)
  const warning = ctx.fireWarning
  const { text, note } = fireCell(ctx.fireStatus, warning, ctx.fireUncovered)
  let body: ReactNode = text
  if (frame !== null) {
    body = <span className={TEXT.caption}>{frame}</span>
  } else if (warning) {
    // A warned cell links to the fire it is warning about, the same NIFC map a
    // clicked fire on the map opens (TJ, 2026-09-14). The link is the better
    // answer to "what is this", and a tooltip does not exist on touch anyway.
    // The cell reads "⚠️ 3.2", which unlabelled announces as "link, warning
    // three point two", so the label names the fire and where it goes.
    body = (
      <a
        href={nifcFireUrl(warning.longitude, warning.latitude, FIRE_LINK_ZOOM)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${warning.name} on the NIFC map. Opens in a new tab.`}
        className="hover:underline cursor-pointer"
      >
        {text}
      </a>
    )
  } else if (note) {
    // The two unlinked states keep their hover text: N/A means either "never
    // checked here" or "the check failed", and the note is the only thing
    // that says which. `aria-label` is the same sentence for a screen reader.
    body = (
      <span title={note} aria-label={note} className="cursor-help">
        {text}
      </span>
    )
  }
  return <td className={`${TABLE.cell} whitespace-nowrap font-mono`}>{sized(ctx.widths, colKey, body)}</td>
}

// One body cell of a ranked row: every column after the rank, the name, Model
// and Wildfire columns included.
function BodyTd({ col, row, ctx }: { col: ColDef; row: DestinationResult; ctx: CellContext }) {
  const key = col.key as string
  if (col.key === WILDFIRE_KEY) return <FireTd colKey={key} ctx={ctx} />
  // Virtual like the wildfire column: the value rides beside the row. A model
  // that ends inside the window is marked here, once, rather than on each of
  // its numbers (#508): the mark is about the model, and a number with a mark
  // beside it read as a longer number.
  if (col.key === MODEL_KEY) {
    const label = modelCellText(row, ctx.modelFallbackLabel)
    return (
      <td className={`${TABLE.cell} whitespace-nowrap`}>
        {sized(
          ctx.widths,
          key,
          isPartialRow(row) ? (
            <>
              {label}
              <sup className={TABLE.mark}>*</sup>
            </>
          ) : (
            label
          ),
        )}
      </td>
    )
  }
  const raw = row[col.key]
  // An empty cell here is not a gap in the forecast, so it wears the wildfire
  // column's N/A idiom rather than the dash a missing AQI hour gets.
  const missing = unavailableCell(key, raw)
  if (missing !== null) {
    return (
      <td className={`${TABLE.cell} whitespace-nowrap font-mono`}>
        {sized(
          ctx.widths,
          key,
          <span title={missing.cause} aria-label={missing.cause} className={missing.cause ? 'cursor-help' : undefined}>
            {missing.text}
          </span>,
        )}
      </td>
    )
  }
  const display = cellText(col, raw)
  // Color comes from the table's own base, or inline for a ranked column: an
  // inline color beats the inherited one either way.
  const cellClass = `${TABLE.cell} whitespace-nowrap ${key === 'name' ? 'font-sans font-medium' : 'font-mono'}`
  if (key === 'name') {
    const href = destinationUrl(row)
    return <NameTd cellClass={cellClass} widths={ctx.widths} label={display} name={row.name} onCenter={ctx.onCenter} href={href} />
  }
  const colorSty = cellColor(key, raw, ctx.coloredGroup, ctx.pointSample)
  if (col.windyLayer) {
    return (
      <td className={cellClass} style={colorSty}>
        {sized(
          ctx.widths,
          key,
          <a
            href={windyCellUrl(row, key, col.windyLayer, ctx.modelId, ctx.times)}
            target="_blank"
            rel="noopener noreferrer"
            // The link text is the measurement itself, so unlabelled this
            // announces as "link, 0.0000". The label names the destination
            // and the site, never the layer: a layer name would be a metric
            // spelled at a call site, which the linter's metric-name ban forbids.
            aria-label={`Open ${row.name} on Windy. Opens in a new tab.`}
            className="hover:underline cursor-pointer"
          >
            {display}
          </a>,
        )}
      </td>
    )
  }
  return (
    <td className={cellClass} style={colorSty}>
      {sized(ctx.widths, key, display)}
    </td>
  )
}

interface RowProps {
  row: DestinationResult
  rank: string
  columns: ColDef[]
  widths: Record<string, number>
  coloredGroup: ReadonlySet<string>
  pointSample: boolean
  modelFallbackLabel?: string | null
  modelId?: string | null
  times?: readonly number[]
  fireStatus: FireProximityStatus
  fireWarning?: FireWarning
  fireUncovered: boolean
  // Absent when the table has no chart column.
  chartBox?: ChartBox
  charted: boolean
  chartColor?: string
  onRemove?: (row: DestinationResult) => void
  onFocusResult?: (row: DestinationResult) => void
}

function ResultsTableRow({
  row,
  rank,
  columns,
  widths,
  coloredGroup,
  pointSample,
  modelFallbackLabel,
  modelId,
  times,
  fireStatus,
  fireWarning,
  fireUncovered,
  chartBox,
  charted,
  chartColor,
  onRemove,
  onFocusResult,
}: RowProps) {
  const ctx: CellContext = {
    widths,
    coloredGroup,
    pointSample,
    modelFallbackLabel,
    modelId,
    times,
    fireStatus,
    fireWarning,
    fireUncovered,
    onCenter: () => onFocusResult?.(row),
  }
  return (
    <tr className={TABLE.row}>
      {chartBox && <ChartToggle row={row} on={charted} color={chartColor} box={chartBox} />}
      <RankRemoveCell rank={rank} name={row.name} onRemove={onRemove ? () => onRemove(row) : undefined} />
      {columns.map((col) => (
        <BodyTd key={col.key as string} col={col} row={row} ctx={ctx} />
      ))}
      <td aria-hidden="true" className="p-0" />
    </tr>
  )
}

interface PendingProps {
  destination: PendingDestination
  columns: ColDef[]
  widths: Record<string, number>
  chartBox?: ChartBox
  charted: boolean
  chartColor?: string
  // Absent for a CSV row: its truth is the textarea text, so it is removed by
  // editing that, not by an × here.
  onRemovePending?: (d: PendingDestination) => void
  onFocusPending?: (at: { latitude: number; longitude: number }) => void
}

// A custom destination awaiting its first analysis: its name and elevation,
// and a dash in every metric.
function PendingTableRow({
  destination: d,
  columns,
  widths,
  chartBox,
  charted,
  chartColor,
  onRemovePending,
  onFocusPending,
}: PendingProps) {
  // The same fly-to a ranked row's name gives, and for the same reason: the
  // dot is already on the map, so there is nothing an analysis adds to the
  // ability to look at it (TJ, 2026-09-14). No popup follows it, unlike a ranked row's: a popup
  // here would be a forecast card with no forecast in it, and clicking the dot
  // already says what is known.
  const center = () => onFocusPending?.({ latitude: d.latitude, longitude: d.longitude })
  return (
    <tr className={TABLE.row}>
      {chartBox && <ChartToggle row={pendingChartRow(d)} on={charted} color={chartColor} box={chartBox} />}
      <RankRemoveCell
        rank="—"
        name={d.name}
        onRemove={onRemovePending && d.source === 'search' ? () => onRemovePending(d) : undefined}
      />
      {columns.map((col) => {
        const key = col.key as string
        if (key === 'name') {
          const cellClass = `${TABLE.cell} whitespace-nowrap font-sans font-medium`
          const href = destinationUrl(pendingLinkRow(d))
          return <NameTd key={key} cellClass={cellClass} widths={widths} label={d.name} name={d.name} onCenter={center} href={href} />
        }
        if (key === 'elevation_ft') {
          return (
            <td key={key} className={`${TABLE.cell} whitespace-nowrap font-mono`}>
              {sized(widths, 'elevation_ft', d.elevation_ft != null ? d.elevation_ft.toLocaleString() : '—')}
            </td>
          )
        }
        return (
          <td key={key} className={`${TABLE.cell} whitespace-nowrap font-mono ${TEXT.caption}`}>
            {sized(widths, key, '—')}
          </td>
        )
      })}
      <td aria-hidden="true" className="p-0" />
    </tr>
  )
}

export const PendingRow = memo(PendingTableRow)
export default memo(ResultsTableRow)
