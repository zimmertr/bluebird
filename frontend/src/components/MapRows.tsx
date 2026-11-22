import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconMenu, IconSearch } from './icons'
import { MenuButton } from './Menu'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { LAYER, MAP_CHIP_SUMMARY_TEXT, MAP_ROWS, MAP_SLOT, MAP_TOOL } from '../styles'
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
  /** Receives a phone's 3D button slot, left of the locate button (#799); null at a desk. */
  onTerrainSlot: (slot: HTMLDivElement | null) => void
  /** Receives a phone's compass slot, under the locate button at the chip row's end (record 0147); null at a desk. */
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
  /** The Legend chip and its key (`MapLegend`). */
  legend: ReactNode
  /**
   * At a desk, the sentence bar that stands where the Controls chip stood,
   * and the card one of its chips opened, under the chips (record 0309). On a
   * phone the bar stands where the search pill stood, and the Controls chip
   * goes, since each phrase raises the sheet (record 0328).
   */
  bar?: ReactNode
  barCard?: ReactNode
  /** A full-screen results sheet stands over the rows (#837), which are out of reach until it comes down. */
  covered?: boolean
  /**
   * A phone's map tools, Layers and drawing a loop, which stand in its tool
   * column with the search button and the 3D, locate and compass slots
   * (record 0331).
   */
  tools?: ReactNode
}

/**
 * The map's two rows across its top (#696; record 0135), at both widths since
 * #714 (record 0174): the search pill, and the chip row under it, the controls
 * summary, Legend and Layers. The row keeps that one shape from arrival to
 * results: Legend greys until it has a key to show rather than coming and
 * going. On a phone the locate button stands at the pill's right, the 3D
 * button beside it (#799), and the compass, while the map is turned or
 * tilted, at the chip row's end under them. A desk's map buttons stand in the
 * map's bottom-right corner instead (`MapCorner`), so a desk's rows have no
 * slots (record 0174).
 *
 * The summary chip opens the panel. A phone's raises the Controls sheet and
 * lowers it again, lit while it is up. A desk's panel is docked beside the map
 * with its own close button, so its chip stands only while the panel is shut,
 * as the one way back to it from the map.
 *
 * While the field has the keyboard or its list is open, a phone's pill takes
 * the whole first row, over the two buttons, and the chip row steps aside
 * at both widths, so the list hangs over the map rather than over the chips.
 */
export default function MapRows({
  searchBoxRef,
  onSearchSelect,
  searchPointed,
  onLocateSlot,
  onTerrainSlot,
  onCompassSlot,
  desk,
  sidebarOpen,
  onOpenControls,
  onCloseControls,
  controlsSummary,
  legend,
  covered = false,
  bar,
  barCard,
  tools,
}: MapRowsProps) {
  const summaryId = useId()
  const [searching, setSearching] = useState(false)
  const phoneBar = !desk && bar !== undefined && bar !== null
  const summaryShown = (!desk || !sidebarOpen) && !bar

  // Stands in for the Controls sheet's Done, or the desk panel's Close, so it
  // takes the keyboard when that button goes inert under it (#576).
  const controlsRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(controlsRef, !sidebarOpen)
  // A phone's bar holds the way back instead: its When phrase, the one the
  // sheet's Done stands in for as the chip did.
  const barRef = useRef<HTMLDivElement>(null)
  const barFocusRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    barFocusRef.current = barRef.current?.querySelector<HTMLElement>('[data-card="forecast"]') ?? null
  })
  useTakeOrphanedFocus(barFocusRef, phoneBar && !sidebarOpen)

  // A phone's search button opens the field over the bar with the keyboard
  // in it (record 0331), and it goes when the field gives the keyboard and
  // its list up, or a place is picked. Only once it has been open: the field
  // reports itself shut as it mounts. Escape hands the keyboard back to the
  // button, as a menu's does to its trigger.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchWasOpen = useRef(false)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!searchOpen) return
    searchWasOpen.current = false
    searchBoxRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSearchOpen(false)
      searchButtonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [searchOpen, searchBoxRef])
  const onSearchExpanded = (expanded: boolean) => {
    if (expanded) searchWasOpen.current = true
    else if (searchWasOpen.current) setSearchOpen(false)
  }

  return (
    // A popup keeps clear of the rows (`resultsLayer.ts` finds every
    // `data-map-overlay`), which stand over the top of every map.
    <div data-map-overlay="" className={`${MAP_ROWS.stack} ${LAYER.mapControls}`} inert={covered}>
      {/* A desk's bar is a card taller than a chip, on a row of its own height (record 0314). */}
      <div className={desk && bar ? MAP_ROWS.barRow : MAP_ROWS.row}>
        {/* A desk's search is in the Where card (record 0313). */}
        {phoneBar && (
          <div ref={barRef} className={MAP_ROWS.pillWide}>
            {bar}
          </div>
        )}
        {phoneBar && searchOpen && (
          <div className={MAP_ROWS.searchOver}>
            <SearchBox
              ref={searchBoxRef}
              onSelect={(place) => {
                onSearchSelect(place)
                setSearchOpen(false)
              }}
              pointed={searchPointed}
              onExpandedChange={onSearchExpanded}
            />
          </div>
        )}
        {!bar && (
          <div className={searching ? MAP_ROWS.pillWide : MAP_ROWS.pill}>
            <SearchBox ref={searchBoxRef} onSelect={onSearchSelect} pointed={searchPointed} onExpandedChange={setSearching} />
          </div>
        )}
        {/* A desk's sentence bar beside the pill (record 0309), so Legend and
            Layers keep the row under it and the legend's card its place over
            the map's left edge (TJ, 2026-10-18). */}
        {desk && bar && <div className={MAP_ROWS.barSlot}>{bar}</div>}
      </div>
      {/* Hidden rather than unmounted while the pill is wide, so an open
          menu's chip and the panel's focus hand-off keep their state. */}
      <div className={searching ? 'hidden' : MAP_ROWS.chips}>
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
      </div>
      {/* A phone's tool column under the bar (record 0331). The map stands
          its own 3D, locate and compass buttons in the three slots, so each
          keeps its states and the locate button its permission prompt; the
          compass shows only while the map is turned or tilted. */}
      {phoneBar && (
        <div className={MAP_ROWS.phoneTools}>
          <button
            ref={searchButtonRef}
            type="button"
            aria-label="Search for a place"
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((o) => !o)}
            className={MAP_TOOL.draw}
          >
            <IconSearch />
          </button>
          {tools}
          <div ref={onTerrainSlot} className={MAP_SLOT.tool} />
          <div ref={onLocateSlot} className={MAP_SLOT.tool} />
          <div ref={onCompassSlot} className={MAP_SLOT.compass} />
        </div>
      )}
      {desk && barCard && <div className={MAP_ROWS.barSlot}>{barCard}</div>}
    </div>
  )
}
