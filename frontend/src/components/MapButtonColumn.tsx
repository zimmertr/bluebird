import type { ReactNode, RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconMenu } from './icons'
import { BUTTON_FLOATING, LAYER, MAP_COL_GAP, MAP_COL_W, MAP_EDGE, MAP_ROW_H } from '../styles'
import type { Place } from '../utils/geocode'

interface MapButtonColumnProps {
  /** The search field's handle, which the panel's Map group focuses. */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in the search field. */
  onSearchSelect: (place: Place) => void
  /** The panel's Map group is hovered, so the field wears a ring. */
  searchPointed: boolean
  /** Whether the panel is open; the Controls button stands in the column while it is not. */
  sidebarOpen: boolean
  /** Reopens the panel. */
  onOpenControls: () => void
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
  searchPointed,
  sidebarOpen,
  onOpenControls,
  children,
}: MapButtonColumnProps) {
  return (
    <div className={`absolute ${MAP_EDGE.top} ${MAP_EDGE.left} ${LAYER.mapControls} flex flex-col items-start ${MAP_COL_GAP}`}>
      {/* The search field is the column's first row rather than a
          neighbour of the Controls button (TJ, 2026-09-14). Beside it,
          the two of them at the column's shared width needed 400px of a
          390px phone; above it, every member of the column is one row
          wide and the column reads as one object at every width.

          Raised above its later siblings so its results paint over the
          buttons below — they are siblings in one cluster, and DOM order
          alone put the buttons on top (#288 review). */}
      <div className="relative z-10">
        <SearchBox ref={searchBoxRef} onSelect={onSearchSelect} pointed={searchPointed} />
      </div>
      {!sidebarOpen && (
        <button
          onClick={onOpenControls}
          aria-label="Open controls"
          className={`${BUTTON_FLOATING} ${MAP_COL_W} ${MAP_ROW_H} flex flex-shrink-0 items-center gap-2 px-2.5`}
        >
          <IconMenu />
          Controls
        </button>
      )}
      {children}
    </div>
  )
}
