import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import BottomSheet from './BottomSheet'
import { LegendSections, type LegendSectionSpec } from './MapLegend'
import { IconMenu } from './icons'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import {
  DISABLED,
  LAYER,
  MAP_CHIP,
  MAP_CHIP_SUMMARY,
  MAP_CHIP_SUMMARY_TEXT,
  MAP_LOCATE,
  MAP_ROWS,
} from '../styles'
import type { Place } from '../utils/geocode'

interface PhoneMapRowsProps {
  /** The search field's handle, which `MapStage` holds. */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in the search field. */
  onSearchSelect: (place: Place) => void
  /** The panel's Map group is hovered, so the field wears a ring. */
  searchPointed: boolean
  /** Receives the locate button's slot, which the map stands its own button in. */
  onLocateSlot: (slot: HTMLDivElement | null) => void
  /** Whether the Controls sheet is open; the summary chip takes the keyboard back when it shuts. */
  sidebarOpen: boolean
  /** Raises the Controls sheet (record 0141). */
  onOpenControls: () => void
  /** Lowers it, from the chip that raised it. */
  onCloseControls: () => void
  /** The summary chip's words: the When arm and the model (`controlsSummary`). */
  controlsSummary: string
  /** The Layers chip and its sheet (`LayersPopover`, `sheet`). */
  layers: ReactNode
  /** What the Legend sheet holds (`legendSections`); none greys the chip. */
  legend: readonly LegendSectionSpec[]
}

/**
 * The phone's two rows across the top of the map (#696; record 0135): the
 * search pill with the locate button at its right, and the chip row under it,
 * the controls summary, Layers and Legend. The row keeps that one shape from
 * arrival to results: Legend greys until it has a key to show rather than
 * coming and going. Analyze stays the drawer's own button, and the row's
 * right end is left empty. A desk keeps its column (`MapButtonColumn`).
 *
 * While the field has the keyboard or its list is open the pill takes the
 * whole first row, over the locate button, and the chip row steps aside, so
 * the list hangs over the map rather than over the chips.
 */
export default function PhoneMapRows({
  searchBoxRef,
  onSearchSelect,
  searchPointed,
  onLocateSlot,
  sidebarOpen,
  onOpenControls,
  onCloseControls,
  controlsSummary,
  layers,
  legend,
}: PhoneMapRowsProps) {
  const summaryId = useId()
  const [searching, setSearching] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const legendShown = legend.length > 0
  // A key can go while its sheet is open (a layer switched off elsewhere, a
  // report put back), and the chip greys under it; the sheet goes with it
  // rather than coming back by itself with the next key.
  useEffect(() => {
    if (!legendShown) setLegendOpen(false)
  }, [legendShown])

  // Stands in for the Controls sheet's Done, so it takes the keyboard when
  // that button goes inert under it (#576).
  const controlsRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(controlsRef, !sidebarOpen)

  return (
    // A popup keeps clear of the rows (`resultsLayer.ts` finds every
    // `data-map-overlay`), which stand over the top of every phone's map.
    <div data-map-overlay="" className={`${MAP_ROWS.stack} ${LAYER.mapControls}`}>
      <div className={MAP_ROWS.row}>
        <div className={searching ? MAP_ROWS.pillWide : MAP_ROWS.pill}>
          <SearchBox
            ref={searchBoxRef}
            onSelect={onSearchSelect}
            pointed={searchPointed}
            pill
            onExpandedChange={setSearching}
          />
        </div>
        {/* Empty here: the map stands its own locate button in it, so the
            button keeps the library's states and its permission prompt. */}
        <div ref={onLocateSlot} className={MAP_LOCATE} />
      </div>
      {/* Hidden rather than unmounted while the pill is wide, so an open
          sheet's chip and the drawer's focus hand-off keep their state. */}
      <div className={searching ? 'hidden' : MAP_ROWS.chips}>
        <button
          ref={controlsRef}
          // The chip lowers the sheet it raised, and is lit while it is up,
          // the way Layers and Legend are for theirs.
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
        {layers}
        <button
          onClick={() => setLegendOpen((o) => !o)}
          disabled={!legendShown}
          aria-expanded={legendOpen}
          className={`${MAP_CHIP} ${DISABLED}`}
        >
          Legend
        </button>
      </div>
      {legendOpen && legendShown && (
        <BottomSheet heading="Legend" onClose={() => setLegendOpen(false)}>
          <LegendSections sections={legend} />
        </BottomSheet>
      )}
    </div>
  )
}
