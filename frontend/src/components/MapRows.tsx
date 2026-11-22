import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import SearchBox, { type SearchBoxHandle } from './SearchBox'
import { IconSearch } from './icons'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { LAYER, MAP_ROWS, MAP_SLOT, MAP_TOOL } from '../styles'
import type { Place } from '../utils/geocode'

interface MapRowsProps {
  /** The search field's handle, which `MapStage` holds. */
  searchBoxRef: RefObject<SearchBoxHandle | null>
  /** A place picked in the search field. */
  onSearchSelect: (place: Place) => void
  /** The panel's Map group is hovered, so the field wears a ring. */
  searchPointed: boolean
  /** Receives a phone's locate button slot, which the map stands its own button in; never called at a desk. */
  onLocateSlot: (slot: HTMLDivElement | null) => void
  /** Receives a phone's 3D button slot, over the locate button's (#799). */
  onTerrainSlot: (slot: HTMLDivElement | null) => void
  /** Receives a phone's compass slot, at the tool column's foot (record 0147). */
  onCompassSlot: (slot: HTMLDivElement | null) => void
  /** A desk's width: the bar stands on a row of its own height, and the map buttons in its corner. */
  desk: boolean
  /** Whether the Controls sheet is up on a phone, which the bar's When phrase takes the keyboard back from. */
  sidebarOpen: boolean
  /** The Legend chip and its key (`MapLegend`). */
  legend: ReactNode
  /**
   * The sentence bar (records 0309 and 0328): at a desk on a row of its own,
   * with the card one of its chips opened under the chips; on a phone the
   * whole first row (record 0331), each phrase raising the Controls sheet.
   */
  bar: ReactNode
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
 * The map's rows across its top (#696; records 0135 and 0174): the sentence
 * bar, and the chip row under it, where Legend stands, greyed until it has a
 * key to show rather than coming and going. A desk's map buttons stand in the
 * map's bottom-right corner (`MapCorner`), so a desk's rows have no slots. A
 * phone's stand in a column down the map's right edge under the bar (record
 * 0331), led by a search button that opens the place search over the bar.
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
  legend,
  covered = false,
  bar,
  barCard,
  tools,
}: MapRowsProps) {
  // A phone's bar holds the way back from the Controls sheet: its When
  // phrase, which takes the keyboard when the sheet's Done goes inert (#576).
  const barRef = useRef<HTMLDivElement>(null)
  const barFocusRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    barFocusRef.current = barRef.current?.querySelector<HTMLElement>('[data-card="forecast"]') ?? null
  })
  useTakeOrphanedFocus(barFocusRef, !desk && !sidebarOpen)

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
    <>
      {/* A popup keeps clear of the rows (`resultsLayer.ts` finds every
          `data-map-overlay`), which stand over the top of every map. */}
      <div data-map-overlay="" className={`${MAP_ROWS.stack} ${LAYER.mapControls}`} inert={covered}>
        {/* A desk's bar is a card taller than a chip, on a row of its own height (record 0314). */}
        <div className={desk ? MAP_ROWS.barRow : MAP_ROWS.row}>
          {desk ? (
            <div className={MAP_ROWS.barSlot}>{bar}</div>
          ) : (
            <div ref={barRef} className={MAP_ROWS.pillWide}>
              {bar}
            </div>
          )}
          {!desk && searchOpen && (
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
        </div>
        <div className={MAP_ROWS.chips}>{legend}</div>
        {desk && barCard && <div className={MAP_ROWS.barSlot}>{barCard}</div>}
      </div>
      {/* A phone's tool column under the bar (record 0331), Layers first as
          the prototype's is, so the tour's Layers card keeps the band between
          the button and its sheet. The map stands
          its own 3D, locate and compass buttons in the three slots, so each
          keeps its states and the locate button its permission prompt; the
          compass shows only while the map is turned or tilted. */}
      {!desk && (
        <div data-map-overlay="" className={MAP_ROWS.phoneTools} inert={covered}>
          {tools}
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
          <div ref={onTerrainSlot} className={MAP_SLOT.tool} />
          <div ref={onLocateSlot} className={MAP_SLOT.tool} />
          <div ref={onCompassSlot} className={MAP_SLOT.compass} />
        </div>
      )}
    </>
  )
}
