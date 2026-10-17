import { useId, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconMenu } from './icons'
import { takeOrphanedFocus } from '../hooks/useFocusHandoff'
import { BUTTON_FLOATING, LAYER, MAP_CHIP_SUMMARY_TEXT, MAP_COL_GAP, MAP_COL_W, MAP_EDGE, MAP_ROW_H } from '../styles'
import type { Place, SearchView } from '../utils/geocode'

interface MapButtonColumnProps {
  /** The search field's handle, which the panel's Map group focuses. */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in the search field. */
  onSearchSelect: (place: Place) => void
  /** The map's view when a search is sent, which biases and orders its answer (#711). */
  searchView: () => SearchView | null
  /** The panel's Map group is hovered, so the field wears a ring. */
  searchPointed: boolean
  /** Whether the panel is open; the Controls button stands in the column while it is not. */
  sidebarOpen: boolean
  /** Reopens the panel. */
  onOpenControls: () => void
  /** The Controls button's words: the When arm and the model, as a phone's chip says them (`controlsSummary`). */
  controlsSummary: string
  /** The Layers button and its popover, the column's last row. */
  children: ReactNode
}

/**
 * Top-left map cluster — reopen-controls button (only while the
 * panel is collapsed) + place search + Layers. It takes its own
 * layer: what these buttons open hangs down across the map's bottom
 * chrome and across the sheet, and the layer has to sit on the
 * cluster rather than on the popover inside it (see LAYER). It stays
 * under the loading overlay and the mobile drawer backdrop.
 */
export default function MapButtonColumn({
  searchBoxRef,
  onSearchSelect,
  searchView,
  searchPointed,
  sidebarOpen,
  onOpenControls,
  controlsSummary,
  children,
}: MapButtonColumnProps) {
  const summaryId = useId()
  return (
    <div
      // A popup keeps clear of this column (`resultsLayer.ts` finds every
      // `data-map-overlay`), which stands over every map at every width.
      data-map-overlay=""
      className={`absolute ${MAP_EDGE.top} ${MAP_EDGE.left} ${LAYER.mapControls} flex flex-col items-start ${MAP_COL_GAP.gap}`}
    >
      {/* The search field is the column's first row rather than a
          neighbour of the Controls button (TJ, 2026-09-14). Beside it,
          the two of them at the column's shared width needed 400px of a
          390px phone; above it, every member of the column is one row
          wide and the column reads as one object at every width.

          Raised above its later siblings so its results paint over the
          buttons below — they are siblings in one cluster, and DOM order
          alone put the buttons on top (#288 review). */}
      <div className="relative z-10">
        <SearchBox ref={searchBoxRef} onSelect={onSearchSelect} view={searchView} pointed={searchPointed} />
      </div>
      {/* Stands in for the drawer's Close button, so it takes the keyboard
          when that button goes inert under it (#576). */}
      {!sidebarOpen && (
        <button
          ref={takeOrphanedFocus}
          onClick={onOpenControls}
          aria-label="Open controls"
          // What the panel holds, as a phone's summary chip says it (#696, the
          // maintainer, 2026-10-14): the When arm and the model, in place of
          // the word. Its name stays the button's job, and the summary rides
          // as its description, the chip's way.
          aria-describedby={summaryId}
          className={`${BUTTON_FLOATING} ${MAP_COL_W} ${MAP_ROW_H} flex flex-shrink-0 items-center gap-2 px-2.5`}
        >
          <IconMenu className="flex-shrink-0" />
          <span id={summaryId} className={MAP_CHIP_SUMMARY_TEXT}>
            {controlsSummary}
          </span>
        </button>
      )}
      {children}
    </div>
  )
}
