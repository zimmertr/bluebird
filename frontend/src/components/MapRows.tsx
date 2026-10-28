import { useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconMenu } from './icons'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { LAYER, MAP_CHIP_SUMMARY, MAP_CHIP_SUMMARY_TEXT, MAP_ROWS, MAP_SLOT } from '../styles'
import type { Place } from '../utils/geocode'

interface MapRowsProps {
  /** The search field's handle, which `MapStage` holds. */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in the search field. */
  onSearchSelect: (place: Place) => void
  /** The panel's Map group is hovered, so the field wears a ring. */
  searchPointed: boolean
  /** Receives a phone's locate button slot, which the map stands its own button in; null at a desk. */
  onLocateSlot: (slot: HTMLDivElement | null) => void
  /**
   * Receives a phone's compass slot, under the locate button at the chip row's
   * end (record 0147), where the 3D button stands too (#799); null at a desk.
   */
  onCompassSlot: (slot: HTMLDivElement | null) => void
  /** A desk's width (#714): the panel is docked, so the summary chip stands only while it is shut. */
  desk: boolean
  /** Whether the controls panel is open: docked at a desk, the Controls sheet on a phone. */
  sidebarOpen: boolean
  /** Opens the panel: raises the Controls sheet (record 0141) or docks the desk's panel. */
  onOpenControls: () => void
  /** Lowers a phone's Controls sheet, from the chip that raised it. */
  onCloseControls: () => void
  /** The summary chip's words: the When arm and the model (`controlsSummary`). */
  controlsSummary: string
  /** The Layers chip and its menu (`LayersPopover`). */
  layers: ReactNode
  /** The Legend chip and its key (`MapLegend`). */
  legend: ReactNode
}

/**
 * The map's two rows across its top (#696; record 0135), at both widths since
 * #714 (record 0174): the search pill, and the chip row under it, the controls
 * summary, Legend and Layers. The row keeps that one shape from arrival to
 * results: Legend greys until it has a key to show rather than coming and
 * going. On a phone the locate button stands at the pill's right, and at the
 * chip row's end under it the 3D button and, while the map is turned or
 * tilted, the compass before it (#799). A desk's
 * map buttons stand in the map's bottom-right corner instead (`MapCorner`), so
 * a desk's rows have no slots (record 0174).
 *
 * The summary chip opens the panel. A phone's raises the Controls sheet and
 * lowers it again, lit while it is up. A desk's panel is docked beside the map
 * with its own close button, so its chip stands only while the panel is shut,
 * as the one way back to it from the map.
 *
 * While the field has the keyboard or its list is open, a phone's pill takes
 * the whole first row, over the locate button, and the chip row steps aside
 * at both widths, so the list hangs over the map rather than over the chips.
 */
export default function MapRows({
  searchBoxRef,
  onSearchSelect,
  searchPointed,
  onLocateSlot,
  onCompassSlot,
  desk,
  sidebarOpen,
  onOpenControls,
  onCloseControls,
  controlsSummary,
  layers,
  legend,
}: MapRowsProps) {
  const summaryId = useId()
  const [searching, setSearching] = useState(false)
  const summaryShown = !desk || !sidebarOpen

  // Stands in for the Controls sheet's Done, or the desk panel's Close, so it
  // takes the keyboard when that button goes inert under it (#576).
  const controlsRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(controlsRef, !sidebarOpen)

  return (
    // A popup keeps clear of the rows (`resultsLayer.ts` finds every
    // `data-map-overlay`), which stand over the top of every map.
    <div data-map-overlay="" className={`${MAP_ROWS.stack} ${LAYER.mapControls}`}>
      <div className={MAP_ROWS.row}>
        <div className={searching ? MAP_ROWS.pillWide : MAP_ROWS.pill}>
          <SearchBox ref={searchBoxRef} onSelect={onSearchSelect} pointed={searchPointed} onExpandedChange={setSearching} />
        </div>
        {/* Empty here: the map stands its own locate button in it, so the
            button keeps the library's states and its permission prompt. */}
        {!desk && <div ref={onLocateSlot} className={MAP_SLOT.locate} />}
      </div>
      {/* Hidden rather than unmounted while the pill is wide, so an open
          menu's chip and the panel's focus hand-off keep their state. */}
      <div className={searching ? 'hidden' : MAP_ROWS.chips}>
        {summaryShown && (
          <button
            ref={controlsRef}
            // A phone's chip lowers the sheet it raised, and is lit while it
            // is up, the way Layers and Legend are for theirs.
            onClick={sidebarOpen ? onCloseControls : onOpenControls}
            aria-label="Open controls"
            aria-expanded={sidebarOpen}
            aria-describedby={summaryId}
            className={MAP_CHIP_SUMMARY}
          >
            <IconMenu className="flex-shrink-0" />
            <span id={summaryId} className={MAP_CHIP_SUMMARY_TEXT}>
              {controlsSummary}
            </span>
          </button>
        )}
        {/* Legend first, so its card, the one open by default, hangs over
            the map's left edge and covers less of it (TJ, 2026-10-18). */}
        {legend}
        {layers}
        {/* The compass's on a phone, the row's right end under the locate
            button (record 0147): the map stands its own compass in it, which
            shows only while the map is turned or tilted, and the 3D button
            after it (#799). */}
        {!desk && <div ref={onCompassSlot} className={MAP_SLOT.compass} />}
      </div>
    </div>
  )
}
