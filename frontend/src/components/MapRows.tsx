import { useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconMenu } from './icons'
import { MenuButton } from './Menu'
import { useCardChips } from '../hooks/useCardChips'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { DESK_CARD, LAYER, MAP_CHIP_SUMMARY_TEXT, MAP_ROWS, MAP_SLOT } from '../styles'
import type { Place } from '../utils/geocode'
import { legendRowVars } from '../utils/results/resultsSheet'

interface MapRowsProps {
  /** The search field's handle, which `MapStage` holds. */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in a phone's search pill. */
  onSearchSelect: (place: Place) => void
  /** Receives a phone's locate button slot, which the map stands its own button in; null at a desk. */
  onLocateSlot: (slot: HTMLDivElement | null) => void
  /** Receives a phone's 3D button slot, left of the locate button (#799); null at a desk. */
  onTerrainSlot: (slot: HTMLDivElement | null) => void
  /** Receives a phone's compass slot, under the locate button at the chip row's end (record 0147); null at a desk. */
  onCompassSlot: (slot: HTMLDivElement | null) => void
  /** A desk's width (#714): the controls are a card in these rows, so the summary chip stands only while it is shut. */
  desk: boolean
  /** Whether the controls are open: the card at a desk, the Controls sheet on a phone. */
  sidebarOpen: boolean
  /**
   * A desk's controls card (record 0305; `AppDrawer`), which stands where a
   * phone's first row does. Absent on a phone.
   */
  card?: ReactNode
  /** Opens the controls: raises the Controls sheet (record 0141) or opens the desk's card. */
  onOpenControls: () => void
  /** Lowers a phone's Controls sheet, from the chip that raised it. */
  onCloseControls: () => void
  /** The summary chip's words: the When arm and the model (`controlsSummary`). */
  controlsSummary: string
  /** The Layers chip and its menu (`LayersPopover`). */
  layers: ReactNode
  /** The Legend chip and its key (`MapLegend`). */
  legend: ReactNode
  /** A full-screen results sheet stands over the rows (#837), which are out of reach until it comes down. */
  covered?: boolean
}

/**
 * The map's rows across its top (#696; record 0135): on a phone the search
 * pill, and at both widths (#714, record 0174) the chip row, the controls
 * summary, Legend and Layers. A desk's search stands in the panel's
 * Destinations field instead (record 0306), beside every other way of adding
 * a destination. The row keeps that one shape from arrival to results:
 * Legend greys until it has a key to show rather than coming and going. On a
 * phone the locate button stands at the pill's right, the 3D button beside
 * it (#799), and the compass, while the map is turned or tilted, at the chip
 * row's end under them. A desk's map buttons stand in the map's bottom-right
 * corner instead (`MapCorner`), so a desk's rows have no slots (record 0174).
 *
 * The summary chip opens the controls. A phone's raises the Controls sheet
 * and lowers it again, lit while it is up. A desk's controls are a card in
 * these rows (#825; record 0305), and the chip row stands under it while the
 * legend and the Layers menu have room to open there, and beside it while
 * they have not. The card has its own close button, so the chip stands only
 * while the card is shut, as the one way back to it.
 *
 * While a phone's field has the keyboard or its list is open, the pill takes
 * the whole first row, over the two buttons, and the chip row steps aside,
 * so the list hangs over the map rather than over the chips.
 */
export default function MapRows({
  searchBoxRef,
  onSearchSelect,
  onLocateSlot,
  onTerrainSlot,
  onCompassSlot,
  desk,
  sidebarOpen,
  card,
  onOpenControls,
  onCloseControls,
  controlsSummary,
  layers,
  legend,
  covered = false,
}: MapRowsProps) {
  const summaryId = useId()
  const [searching, setSearching] = useState(false)
  const summaryShown = !desk || !sidebarOpen
  const cardOpen = card !== undefined && sidebarOpen
  // Around an open card the chip row stands under it while the legend has
  // room there, and beside it while it has not (`useCardChips`).
  const stackRef = useRef<HTMLDivElement>(null)
  const chips = useCardChips(stackRef, cardOpen)

  // Stands in for the Controls sheet's Done, or the desk panel's Close, so it
  // takes the keyboard when that button goes inert under it (#576).
  const controlsRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(controlsRef, !sidebarOpen)

  return (
    // A popup keeps clear of the rows (`resultsLayer.ts` finds every
    // `data-map-overlay`), which stand over the top of every map. Around a
    // desk's card the stack is no one box: the card and the chip row can
    // stand side by side over an empty corner a popup may use, so each is
    // its own surface (`AppDrawer` marks the card). The stack publishes where
    // its rows end for the legend's card, which hangs from a chip in it
    // (`legendRowVars`).
    <div
      ref={stackRef}
      data-map-overlay={card ? undefined : ''}
      className={`${MAP_ROWS.stack} ${chips?.side === 'beside' ? DESK_CARD.stackOpen : ''} ${LAYER.mapControls}`}
      style={chips ? (legendRowVars(chips) as CSSProperties) : undefined}
      inert={covered}
    >
      {card}
      {!desk && (
        <div className={MAP_ROWS.row}>
          <div className={searching ? MAP_ROWS.pillWide : MAP_ROWS.pill}>
            <SearchBox ref={searchBoxRef} onSelect={onSearchSelect} onExpandedChange={setSearching} />
          </div>
          {/* Empty here: the map stands its own 3D and locate buttons in
              them, so each keeps its states and the locate button its
              permission prompt. */}
          <div ref={onTerrainSlot} className={MAP_SLOT.terrain} />
          <div ref={onLocateSlot} className={MAP_SLOT.locate} />
        </div>
      )}
      {/* Hidden rather than unmounted while the pill is wide, so an open
          menu's chip and the panel's focus hand-off keep their state. */}
      <div data-map-overlay={card ? '' : undefined} className={searching ? 'hidden' : MAP_ROWS.chips}>
        {summaryShown && (
          // A chip like Layers and Legend beside it, so it answers the
          // pointer and lights while its sheet is up as they do (record
          // 0251), with no chevron because the drawer is not a menu. The one
          // chip that gives way: a narrow row cuts its words.
          <MenuButton
            ref={controlsRef}
            shape="chip"
            open={sidebarOpen}
            chevron={false}
            onClick={sidebarOpen ? onCloseControls : onOpenControls}
            aria-label="Open controls"
            aria-describedby={summaryId}
            className="min-w-0"
          >
            <IconMenu className="flex-shrink-0" />
            <span id={summaryId} className={MAP_CHIP_SUMMARY_TEXT}>
              {controlsSummary}
            </span>
          </MenuButton>
        )}
        {/* Legend first, so its card, the one open by default, hangs over
            the map's left edge and covers less of it (TJ, 2026-10-18). */}
        {legend}
        {layers}
        {/* The compass's on a phone, the row's empty right end under the
            locate button (record 0147): the map stands its own compass in it,
            which shows only while the map is turned or tilted. */}
        {!desk && <div ref={onCompassSlot} className={MAP_SLOT.compass} />}
      </div>
    </div>
  )
}
