import { useId, useRef, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconMenu } from './icons'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import {
  DISABLED,
  LAYER,
  MAP_ANALYZE,
  MAP_BUTTON,
  MAP_COL_GAP,
  MAP_EDGE,
  MAP_PILL,
  MAP_PILL_SUMMARY,
  MAP_PILL_TEXT,
  MAP_ROW,
} from '../styles'
import type { Place } from '../utils/geocode'

interface MapButtonColumnProps {
  /**
   * The search field's handle. `MapStage` holds it; nothing calls it today,
   * since the panel's Map group only rings the field while it is hovered
   * (`searchPointed`), which a touch screen never sends.
   */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in the search field. */
  onSearchSelect: (place: Place) => void
  /** The panel's Map group is hovered, so the field wears a ring. */
  searchPointed: boolean
  /** Whether the panel is open; the Controls button stands in the column while it is not. */
  sidebarOpen: boolean
  /** Reopens the panel. */
  onOpenControls: () => void
  /**
   * A phone (#696): the search field spans the map, and Controls, Layers and
   * Analyze share one row under it, where a desktop keeps its column.
   */
  phoneRow: boolean
  /** The line under Controls on a phone: the When arm and the model (`controlsSummary`). */
  controlsSummary: string
  /** The panel's Analyze gate, which the phone's Analyze shares (`analyzeGateFor`). */
  analyzeEnabled: boolean
  /** A run is under way, which the button says on its face as the panel's does. */
  analyzing: boolean
  /** The panel's Analyze command itself, never a second path to it. */
  onAnalyze: () => void
  /** The Layers button and its popover, the column's last row. */
  children: ReactNode
}

/**
 * Top-left map cluster — the place search, the reopen-controls button and
 * Layers, and on a phone the map's own Analyze. It takes its own layer: what
 * these buttons open hangs down across the map's bottom chrome and across the
 * sheet, and the layer has to sit on the cluster rather than on the popover
 * inside it (see LAYER). It stays under the loading overlay and the mobile
 * drawer backdrop.
 */
export default function MapButtonColumn({
  searchBoxRef,
  onSearchSelect,
  searchPointed,
  sidebarOpen,
  onOpenControls,
  phoneRow,
  controlsSummary,
  analyzeEnabled,
  analyzing,
  onAnalyze,
  children,
}: MapButtonColumnProps) {
  const summaryId = useId()
  // Stands in for the drawer's Close button, so it takes the keyboard when
  // that button goes inert under it (#576). A hook rather than a ref callback,
  // because on a phone the button is there all along and a callback runs only
  // when it mounts.
  const controlsRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(controlsRef, !sidebarOpen)
  // A run disables this button under the keyboard that pressed it, and the
  // overlay's Cancel holds the focus meanwhile; when the run ends the focus
  // comes back here, as it does to the panel's Analyze (#576).
  const analyzeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(analyzeRef, analyzeEnabled)

  return (
    <div
      // A popup keeps clear of this column (`resultsLayer.ts` finds every
      // `data-map-overlay`), which stands over every map at every width.
      data-map-overlay=""
      className={`absolute ${MAP_EDGE.top} ${MAP_EDGE.left} ${phoneRow ? MAP_EDGE.right : ''} ${LAYER.mapControls} flex flex-col ${phoneRow ? 'items-stretch' : 'items-start'} ${MAP_COL_GAP}`}
    >
      {/* The search field is the column's first row rather than a
          neighbour of the Controls button (TJ, 2026-09-14). Beside it,
          the two of them at the column's shared width needed 400px of a
          390px phone; above it, every member of the column is one row
          wide and the column reads as one object at every width. On a
          phone it spans the map, because it is the first control a reader
          who opens there meets (#696).

          Raised above its later siblings so its results paint over the
          buttons below — they are siblings in one cluster, and DOM order
          alone put the buttons on top (#288 review). */}
      <div className="relative z-10">
        <SearchBox ref={searchBoxRef} onSelect={onSearchSelect} pointed={searchPointed} wide={phoneRow} />
      </div>
      {phoneRow ? (
        // One row: set the panel up, choose the layers, run. Controls is
        // there whether or not the drawer is open, since the drawer covers
        // the row while it is, and a row that reflowed under the closing
        // drawer would move every button in it.
        <div className={MAP_ROW}>
          <button
            ref={controlsRef}
            onClick={onOpenControls}
            aria-label="Open controls"
            aria-describedby={summaryId}
            className={MAP_PILL}
          >
            <IconMenu className="flex-shrink-0" />
            <span className={MAP_PILL_TEXT}>
              Controls
              <span id={summaryId} className={MAP_PILL_SUMMARY}>
                {controlsSummary}
              </span>
            </span>
          </button>
          {children}
          {/* The panel's own command, gate and face: no notice beside it.
              Every reason it is shut, and every cue that a report has gone
              stale, stays under the panel's Analyze (record 0028), so this
              one never explains itself. That is the accepted cost of a
              second Analyze on the map. */}
          <button
            ref={analyzeRef}
            onClick={onAnalyze}
            disabled={!analyzeEnabled}
            className={`${MAP_ANALYZE} ${DISABLED}`}
          >
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      ) : (
        <>
          {!sidebarOpen && (
            <button ref={controlsRef} onClick={onOpenControls} aria-label="Open controls" className={MAP_BUTTON}>
              <IconMenu />
              Controls
            </button>
          )}
          {children}
        </>
      )}
    </div>
  )
}
