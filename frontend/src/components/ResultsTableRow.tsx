import { createContext, memo, useContext, useEffect, useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { DestinationResult } from '../types'
import {
  CLOSURE_KEY,
  ELEVATION_COL,
  MODEL_KEY,
  TERRAIN_HEIGHT_MARK,
  WILDFIRE_KEY,
  heightDependentKey,
  readAtTerrainHeight,
  type ColDef,
} from '../utils/tableColumns'
import {
  checkRunning,
  fireLoadingFrame,
  type FireProximityStatus,
  type FireWarning,
} from '../utils/fireProximity'
import type { ClosureProximityStatus, ClosureWarning } from '../utils/closureProximity'
import type { ChartBox } from '../hooks/useChartBox'
import { destinationUrl } from '../utils/destinationUrl'
import { FIRE_LINK_ZOOM, nifcFireUrl } from '../utils/wildfires'
import type { PendingDestination } from '../utils/customList'
import { isPartialRow } from '../utils/modelCompare'
import {
  cellColor,
  cellText,
  closureCell,
  fireCell,
  modelCellText,
  pendingChartRow,
  pendingLinkRow,
  unavailableCell,
  windyCellUrl,
} from '../utils/resultsCells'
import { CHOICE_INPUT, ICON_ACTION, LINE_EDGE, LINK_QUIET, SR_ONLY, TABLE, TEXT } from '../styles'
import { IconClose, IconExternalLink } from './icons'
import { sized } from './sizedCell'
import { rowTapOpens } from '../utils/rowTap'
import { NO_VALUE_MARK } from '../utils/unavailableCell'
import { grouped } from '../utils/numbers'

// One body row of the results table, ranked or pending. Apart from the table
// and memoized because a report can hold a thousand rows and most changes to
// the table touch few of them: a chart toggle changes one row's box, and a
// live cut fades a handful out. Every prop is a primitive, a value the table
// memoizes, or a callback whose identity the table holds still, so a row
// whose own inputs did not move is skipped.

// The number cell that swaps to the remove × on row hover (a coarse pointer
// shows the number alone and removes from the marker card, `TABLE.removeFace`).
// `rank` is "—" for pending rows.
// Both faces sit in one grid cell (TABLE.rankStack) so the column never
// changes width when they trade places; see the role's comment.
//
// The × idles at no opacity rather than `invisible`, because a hidden element
// cannot take focus and the keyboard could not reach it at all (#576). It
// shows as the row's own keyboard focus does, the way it shows on hover.
function RankRemoveCell({ rank, name, onRemove }: { rank: string; name: string; onRemove?: () => void }) {
  return (
    <td className={`${TABLE.cell} tabular-nums whitespace-nowrap`}>
      {onRemove ? (
        <span className={TABLE.rankStack}>
          <span className={`${TEXT.caption} ${TABLE.rankFace} ${TABLE.rankIdleFace}`}>{rank}</span>
          <button
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className={`${TABLE.rankFace} ${TABLE.removeFace} leading-none ${ICON_ACTION} cursor-pointer`}
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
//
// A ticked box is filled with its line's colour, which in light is a pastel
// under 3:1 on the panel, so it wears the rim the line is drawn over (PR
// #733), which the dark theme draws transparent (`LINE_EDGE`). An unticked
// box is the browser's own and needs none.
function ChartToggle({
  row,
  on,
  color,
  box,
}: {
  row: DestinationResult
  on: boolean
  color?: string
  box: ChartBox
}) {
  const tinted = on && color
  return (
    <td className={TABLE.cell}>
      <input
        type="checkbox"
        checked={on}
        onClick={(e) => box.onShift(e.shiftKey)}
        onChange={() => box.onToggle(row)}
        aria-label={`Chart ${row.name}`}
        className={tinted ? `${CHOICE_INPUT} ${LINE_EDGE.input}` : CHOICE_INPUT}
        style={tinted ? { accentColor: color } : undefined}
      />
    </td>
  )
}

// The flag cells' shared clock while the wildfire or the closure check is in
// flight: one ticking state for the whole table rather than per cell, so every
// cell shows the same frame, and an interval only while there is something to
// wait for. The frame reaches the cells through a context rather than a row
// prop, because it ticks every 400 ms: as a prop it would redraw every cell of
// every row per tick, where a context redraws only the flag cells that read
// it. Null once both checks have answered; while one still runs, each cell
// asks `checkRunning` of its own check, so an answered column stays still.
const FireFrame = createContext<string | null>(null)

/**
 * The ids of the table's two footnotes, so a mark on a cell can be a link to
 * the line that explains it. The table provides them; a row drawn with no
 * table around it (the tests) has none, and its marks are plain text.
 */
export interface NoteTargets {
  model: string
  terrain: string
}
export const NoteTargetsContext = createContext<NoteTargets | null>(null)

// Takes a reader to a footnote without touching the page's address: the hash
// a plain `#id` link would write is not part of the app's URL state, and the
// results sheet is its own scroll box, so the note is scrolled into view and
// focused where it stands, which also moves a screen reader to it.
function jumpToNote(id: string) {
  const note = document.getElementById(id)
  if (!note) return
  note.scrollIntoView({ block: 'nearest' })
  note.focus({ preventScroll: true })
}

// A raised footnote mark that links to its line under the table. Its text is
// the glyph alone, which is what a sighted reader sees, and the click lands a
// screen reader on the sentence itself; the note is visible, so it is not one
// of the hidden twins the `disabled-reason-twin` check counts.
function FootnoteMark({ glyph, target }: { glyph: string; target: keyof NoteTargets }) {
  const id = useContext(NoteTargetsContext)?.[target]
  return (
    <sup className={TABLE.mark}>
      {id ? (
        <a
          href={`#${id}`}
          className={LINK_QUIET}
          onClick={(event) => {
            event.preventDefault()
            jumpToNote(id)
          }}
        >
          {glyph}
        </a>
      ) : (
        glyph
      )}
    </sup>
  )
}

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
    <td className={`${cellClass} ${TABLE.stickyNameCell}`}>
      {sized(
        widths,
        'name',
        <span className={`flex min-w-0 items-center gap-1.5 ${widths.name === undefined ? TABLE.nameCap : ''}`}>
          <button
            onClick={onCenter}
            aria-label={`Center map on ${name}`}
            className={`${LINK_QUIET} min-w-0 truncate text-left`}
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
  closureStatus: ClosureProximityStatus
  closureWarning?: ClosureWarning
  closureUncovered: boolean
  // The row's elevation lookup is still out (#673).
  heightPending: boolean
  // Centres the map on the row: the name button's fly-to.
  onCenter: () => void
  // The row's own id, from `useId`, so it holds still across renders of a
  // memoized row: the hidden sentences are found by ids built from it.
  rowId: string
}

// The id of a cell's hidden note.
//
// A cell's note is its approved hover `title`, and the same sentence as hidden
// text beside it (#576). It was an `aria-label` on the span, which a screen
// reader does not read on an element with no role, so the reason reached a
// pointer and nobody else. The hidden copy sits in the cell, where reading the
// table reaches it after the value. Each site spells its own title attribute, so the
// approved-tooltip count in `styles.test.ts` keeps seeing every one.
const noteId = (rowId: string, colKey: string) => `${rowId}-${colKey}-note`

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
  if (frame !== null && checkRunning(ctx.fireStatus)) {
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
        className={LINK_QUIET}
      >
        {text}
      </a>
    )
  } else if (note) {
    // The two unlinked states keep their hover text: N/A means either "never
    // checked here" or "the check failed", and the note is the only thing
    // that says which. A screen reader gets the same sentence as hidden text.
    body = (
      <>
        <span title={note} aria-describedby={noteId(ctx.rowId, colKey)} className="cursor-help">
          {text}
        </span>
        <span id={noteId(ctx.rowId, colKey)} className={SR_ONLY}>
          {note}
        </span>
      </>
    )
  }
  return <td className={`${TABLE.cell} whitespace-nowrap font-mono`}>{sized(ctx.widths, colKey, body)}</td>
}

// The Closure column (#550), the wildfire cell's twin: the same clock, the
// same three states and the same hover notes on the two unlinked ones. A
// warned cell names the order, and links it when the Forest Service gave it
// an http(s) page, as a clicked closure's popup does. Its label names the
// order and where it goes, in the shape every new-tab link here wears.
function ClosureTd({ colKey, ctx }: { colKey: string; ctx: CellContext }) {
  const frame = useContext(FireFrame)
  const warning = ctx.closureWarning
  const { text, note } = closureCell(ctx.closureStatus, warning, ctx.closureUncovered)
  let body: ReactNode = text
  if (frame !== null && checkRunning(ctx.closureStatus)) {
    body = <span className={TEXT.caption}>{frame}</span>
  } else if (warning?.url) {
    body = (
      <a
        href={warning.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${warning.name} on the US Forest Service site. Opens in a new tab.`}
        // The whole title on hover: the cell clips a long one (TABLE.clip),
        // and the link is the only element a pointer can rest on.
        title={warning.name}
        className={LINK_QUIET}
      >
        {text}
      </a>
    )
  } else if (note) {
    // An order with no page of its own keeps the hover sentence, like the
    // two N/A states: the note is the only thing that says which one it is.
    body = (
      <>
        <span title={note} aria-describedby={noteId(ctx.rowId, colKey)} className="cursor-help">
          {text}
        </span>
        <span id={noteId(ctx.rowId, colKey)} className={SR_ONLY}>
          {note}
        </span>
      </>
    )
  }
  // A named order is capped and clipped while the column is unsized; a width
  // the reader chose is honoured by sized() instead (TABLE.clip says why).
  if (warning && ctx.widths[colKey] === undefined) {
    body = <span className={TABLE.clip}>{body}</span>
  }
  return <td className={`${TABLE.cell} whitespace-nowrap font-mono`}>{sized(ctx.widths, colKey, body)}</td>
}

// One body cell of a ranked row: every column after the rank, the name, Model
// Wildfire and Closure columns included.
function BodyTd({ col, row, ctx }: { col: ColDef; row: DestinationResult; ctx: CellContext }) {
  const key = col.key as string
  const frame = useContext(FireFrame)
  if (col.key === WILDFIRE_KEY) return <FireTd colKey={key} ctx={ctx} />
  if (col.key === CLOSURE_KEY) return <ClosureTd colKey={key} ctx={ctx} />
  // A row whose elevation is still being looked up has a forecast, but its
  // elevation and the numbers read at that elevation are not yet what the
  // lookup will make them (#673), so those cells tick the flag columns' dots
  // rather than print a number the answer replaces.
  if (ctx.heightPending && frame !== null && heightDependentKey(key)) {
    return (
      <td className={`${TABLE.cell} whitespace-nowrap font-mono`}>
        {sized(ctx.widths, key, <span className={TEXT.caption}>{frame}</span>)}
      </td>
    )
  }
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
              <FootnoteMark glyph="*" target="model" />
            </>
          ) : (
            label
          ),
        )}
      </td>
    )
  }
  // A place with no recorded elevation shows the terrain height its numbers
  // were read at, marked, rather than a blank over numbers read somewhere
  // (#673, decision 0116). The mark is on this cell because the height is this
  // cell's; the note it points at is the table's.
  if (key === 'elevation_ft' && readAtTerrainHeight(row)) {
    return (
      <td className={`${TABLE.cell} whitespace-nowrap font-mono`}>
        {sized(
          ctx.widths,
          key,
          <>
            {grouped(Number(row.terrain_ft))}
            <FootnoteMark glyph={TERRAIN_HEIGHT_MARK} target="terrain" />
          </>,
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
          missing.cause ? (
            <>
              <span title={missing.cause} aria-describedby={noteId(ctx.rowId, key)} className="cursor-help">
                {missing.text}
              </span>
              <span id={noteId(ctx.rowId, key)} className={SR_ONLY}>
                {missing.cause}
              </span>
            </>
          ) : (
            missing.text
          ),
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
            // The value is the link's name, so a reader hears the forecast:
            // reading the table, tabbing, or saying "click 11.5" to voice
            // control. A label here replaced the value in every cell (#575).
            // Where the link goes rides as its description instead, one
            // sentence per row in the row's filler cell. It names the
            // destination and the site, never the layer: a layer name would be
            // a metric spelled at a call site, which the linter's metric-name
            // ban forbids.
            aria-describedby={windyNoteId(ctx.rowId)}
            className={LINK_QUIET}
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

// The id of a row's one Windy sentence.
const windyNoteId = (rowId: string) => `${rowId}-windy`

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
  closureStatus: ClosureProximityStatus
  closureWarning?: ClosureWarning
  closureUncovered: boolean
  heightPending: boolean
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
  closureStatus,
  closureWarning,
  closureUncovered,
  heightPending,
  chartBox,
  charted,
  chartColor,
  onRemove,
  onFocusResult,
}: RowProps) {
  const rowId = useId()
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
    closureStatus,
    closureWarning,
    closureUncovered,
    heightPending,
    onCenter: () => onFocusResult?.(row),
    rowId,
  }
  // A press on the row's ground opens the popup a click on its marker gives,
  // through the same fly-to the name's button takes (record 0143); a press on
  // any control in the row is that control's alone (`rowTapOpens`). A pointer
  // shortcut beside the name's button, which stays the row's way in for a
  // keyboard and a screen reader, so the row itself takes no role or focus.
  const openFromRow = (e: MouseEvent<HTMLTableRowElement>) => {
    if (onFocusResult && rowTapOpens(e.target, e.currentTarget, window.getSelection()?.toString() ?? '')) onFocusResult(row)
  }
  return (
    <tr className={`${TABLE.row} ${onFocusResult ? TABLE.rowOpens : ''}`} onClick={openFromRow}>
      {chartBox && <ChartToggle row={row} on={charted} color={chartColor} box={chartBox} />}
      <RankRemoveCell rank={rank} name={row.name} onRemove={onRemove ? () => onRemove(row) : undefined} />
      {columns.map((col) => (
        <BodyTd key={col.key as string} col={col} row={row} ctx={ctx} />
      ))}
      {/* The filler column also holds the row's one copy of the Windy
          sentence every metric link points at, as the header's filler holds
          the sort hint: a reference resolves through aria-hidden, so the
          links are described while the filler stays out of the tree. */}
      <td aria-hidden="true" className="p-0">
        <span id={windyNoteId(rowId)} className={SR_ONLY}>
          {`Open ${row.name} on Windy. Opens in a new tab.`}
        </span>
      </td>
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
  // Used for a searched place only. A CSV row's truth is the textarea text and
  // a found row's is the ring (#782), so each is removed by editing that, not
  // by an × here.
  onRemovePending?: (d: PendingDestination) => void
  onFocusPending?: (at: { latitude: number; longitude: number }) => void
}

// A destination awaiting its forecast, named by the reader or found by a
// ring's search: its name and elevation, and a dash in every metric.
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
      {chartBox && (
        <ChartToggle row={pendingChartRow(d)} on={charted} color={chartColor} box={chartBox} />
      )}
      <RankRemoveCell
        rank={NO_VALUE_MARK}
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
              {sized(widths, 'elevation_ft', cellText(ELEVATION_COL, d.elevation_ft))}
            </td>
          )
        }
        return (
          <td key={key} className={`${TABLE.cell} whitespace-nowrap font-mono ${TEXT.caption}`}>
            {sized(widths, key, NO_VALUE_MARK)}
          </td>
        )
      })}
      <td aria-hidden="true" className="p-0" />
    </tr>
  )
}

export const PendingRow = memo(PendingTableRow)
export default memo(ResultsTableRow)
