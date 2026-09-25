import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Place, parseCoordinates, searchPlaces } from '../utils/geocode'
import {
  ACCENT,
  ACCENT_RING,
  CAPTION_LIFTED,
  CONTROL_SIZE,
  ICON_ACTION,
  ICON_BUTTON,
  MAP_COL_W,
  MAP_ROW_H,
  RADIUS,
  SPINNER,
  STATUS,
  SURFACE_FLOATING,
  SURFACE_POPOVER,
  TAP,
  TEXT,
} from '../styles'
import { IconClose, IconSearch } from './icons'

// The panel under the field, in both of the states it has: the list of places,
// and the line that says why there is no list. One recipe, because they are one
// slot — a reader who searches twice should not be shown two different boxes
// there — and because the state that carries bad news is the one that has to be
// legible over a busy basemap.
//
// The notice used to wear `NOTICE.warn`, which is a panel role: an amber tint at
// 40% over whatever is behind it. Behind it here is the map and the Layers
// button, which showed straight through the box (TJ, 2026-09-14). The popover's
// fill is opaque enough to stand on anything, and `STATUS.warn` keeps the
// severity the tint used to carry — amber-300 reads 7.15:1 on that fill,
// measured 2026-09-14, where AA asks 4.5:1.
const DROPDOWN = `${SURFACE_POPOVER} w-72 sm:w-80 absolute left-0 top-full mt-1`

interface Props {
  onSelect: (place: Place) => void
  // The panel is pointing at this box: the reader is hovering the panel's
  // Map group, whose search-by-name control lives out here on the map rather
  // than in the panel. Purely a cue — nothing about the box's behavior changes.
  pointed?: boolean
}

export interface SearchBoxHandle {
  focus: () => void
}

// Floating place search for the map. Fires on Enter rather than as-you-type —
// Nominatim's usage policy forbids autocomplete — and coordinate pairs are
// handled locally without ever reaching the geocoder. The × only clears the
// text: searched places persist as pins, removed via their 📍 in the table.
const SearchBox = forwardRef<SearchBoxHandle, Props>(function SearchBox({ onSelect, pointed = false }, ref) {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<AbortController | null>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => () => searchRef.current?.abort(), [])

  const open = places !== null || error !== null

  // Click/tap away dismisses the dropdown or error but keeps the query
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPlaces(null)
        setError(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  function pick(place: Place) {
    setPlaces(null)
    setError(null)
    setQuery(place.label)
    onSelect(place)
    inputRef.current?.blur() // drops the mobile keyboard so the map is visible
  }

  async function submit() {
    const q = query.trim()
    if (!q || loading) return
    setError(null)

    const coords = parseCoordinates(q)
    if (coords) {
      pick({
        label: `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`,
        description: '',
        kind: 'coordinates',
        ...coords,
      })
      return
    }

    setLoading(true)
    setPlaces(null)
    // A search the box outlives is answered to nobody, so unmounting aborts it
    // (only one can be in flight: `loading` gates the submit above).
    const controller = new AbortController()
    searchRef.current = controller
    try {
      const found = await searchPlaces(q, controller.signal)
      if (found.length === 0) setError('No places found.')
      else if (found.length === 1) pick(found[0])
      else {
        setPlaces(found)
        setHighlight(0)
      }
    } catch {
      setError('Search failed. Try again later.')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setQuery('')
    setPlaces(null)
    setError(null)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (places && places.length > 0) pick(places[Math.min(highlight, places.length - 1)])
      else submit()
    } else if (e.key === 'ArrowDown' && places) {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, places.length - 1))
    } else if (e.key === 'ArrowUp' && places) {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Escape') {
      setPlaces(null)
      setError(null)
    }
  }

  // The ring rides the wrapper, not the field: the field wears
  // SURFACE_FLOATING's shadow-lg, and the ring's glow is a shadow too. The
  // wrapper's box is exactly the field's (the dropdown below it is absolute),
  // so the outline lands where it looks like it should — and it holds the same
  // radius at all times, because only the ring may fade (see ACCENT_RING).
  return (
    <div
      ref={rootRef}
      data-tour="search"
      className={`relative ${MAP_COL_W} ${RADIUS.surface} transition-shadow ${pointed ? ACCENT_RING : ''}`}
    >
      {/* The box takes the height, not the input inside it: `MAP_ROW_H` is the
          one row height every member of the map's left column wears, so the
          field and the two buttons under it cannot land on three different
          numbers. Sizing the input instead grew the box by its own padding and
          overshot. */}
      <div
        className={`${SURFACE_FLOATING} ${MAP_ROW_H} flex items-center gap-2 px-2.5 transition-colors ${ACCENT.edgeFocus}`}
      >
        <IconSearch className={`flex-shrink-0 ${ICON_ACTION}`} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            // Typing invalidates any previous results — Enter re-searches
            setQuery(e.target.value)
            setPlaces(null)
            setError(null)
          }}
          onKeyDown={onKeyDown}
          // Says what the box is for and stops there. There is no `title`
          // spelling out that it takes a name or a coordinate pair: a search
          // box taking a name is the least surprising thing on the page, and a
          // hover tooltip is invisible on touch anyway.
          placeholder="Search for a destination"
          aria-label="Search for a place"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          // No width of its own: the box is `MAP_COL_W` and the input takes
          // what the icon and the clear button leave. `min-w-0` is what lets
          // it, a flex item's default `min-width:auto` being its content.
          className={`${TEXT.control} min-w-0 flex-1 bg-transparent placeholder-slate-400 focus:outline-none`}
        />
        {loading ? (
          <div
            className={`h-4 w-4 flex-shrink-0 ${SPINNER}`}
            aria-label="Searching"
          />
        ) : query ? (
          <button
            onClick={clear}
            aria-label="Clear search"
            className={`${ICON_BUTTON} flex-shrink-0`}
          >
            <IconClose />
          </button>
        ) : null}
      </div>

      {error && (
        <div className={`${DROPDOWN} ${CONTROL_SIZE} ${STATUS.warn} px-2.5 py-2`}>
          {error}
        </div>
      )}

      {places && (
        <ul
          role="listbox"
          aria-label="Search results"
          // `DROPDOWN` (above) is the surface and the width. This is a menu the
          // reader acts in, hanging over the buttons and legends below, and one
          // step of fill plus the heavier shadow is what says so — the same
          // separation the Layers popover takes against the same legends.
          //
          // It is the ONE thing in this column wider than `MAP_COL_W`, and
          // deliberately so: bound to the column it clipped every second line,
          // and a result reads "Mount Baker, Whatcom County, Washington" — the
          // half that disambiguates it from the other three Mount Bakers is
          // exactly the half that went (TJ, 2026-09-14, reversing the bind).
          // It hangs past the column's right edge the way the model picker's
          // listbox hangs past the panel's.
          className={`${DROPDOWN} overflow-hidden divide-y divide-slate-600`}
        >
          {places.map((p, i) => (
            <li key={`${p.lat},${p.lon},${i}`} role="option" aria-selected={i === highlight}>
              {/* A tint rather than an opaque step, the way the table's rows
                  highlight — re-derived for the popover's lighter fill, which
                  slate-700/30 no longer registers against. slate-600/50 reads
                  1.18:1 on it, where the old pair read 1.11:1 on slate-800, and
                  `CAPTION_LIFTED` below still clears AA on the result (5.89:1).
                  Measured 2026-09-14. */}
              <button
                onClick={() => pick(p)}
                onMouseEnter={() => setHighlight(i)}
                className={`${TAP.height} w-full px-2.5 py-2 text-left transition-colors ${
                  i === highlight ? 'bg-slate-600/50' : ''
                }`}
              >
                <span className={`${TEXT.control} block truncate`}>
                  {p.label}
                  {p.kind && (
                    <span className={`${TEXT.overline} ml-2`}>
                      {p.kind}
                    </span>
                  )}
                </span>
                {p.description && (
                  <span className={`${CAPTION_LIFTED} block truncate`}>{p.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

export default SearchBox
