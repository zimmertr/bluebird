import { useEffect, useRef, useState } from 'react'
import { Place, parseCoordinates, searchPlaces } from '../utils/geocode'

interface Props {
  onSelect: (place: Place) => void
  onClear: () => void
}

// Floating place search for the map. Fires on Enter rather than as-you-type —
// Nominatim's usage policy forbids autocomplete — and coordinate pairs are
// handled locally without ever reaching the geocoder.
export default function SearchBox({ onSelect, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    try {
      const found = await searchPlaces(q)
      if (found.length === 0) setError('No places found.')
      else if (found.length === 1) pick(found[0])
      else {
        setPlaces(found)
        setHighlight(0)
      }
    } catch {
      setError('Search failed — try again.')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setQuery('')
    setPlaces(null)
    setError(null)
    onClear()
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

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg bg-slate-800/95 border border-slate-600 px-2.5 py-2 shadow-lg backdrop-blur-sm transition-colors focus-within:border-sky-400">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="flex-shrink-0 text-slate-400"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
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
          placeholder="Find a peak, city, lake…"
          title="Search by name (Mt Whitney) or coordinates (36.58, -118.29)"
          aria-label="Search for a place"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="w-36 sm:w-64 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
        />
        {loading ? (
          <div
            className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-sky-400"
            aria-label="Searching"
          />
        ) : query ? (
          <button
            onClick={clear}
            aria-label="Clear search"
            className="flex-shrink-0 text-slate-400 hover:text-white text-base leading-none"
          >
            ×
          </button>
        ) : null}
      </div>

      {error && (
        <div className="absolute left-0 top-full mt-1 w-full rounded-lg bg-slate-800/95 border border-slate-600 px-3 py-2 text-xs text-amber-300 shadow-lg backdrop-blur-sm">
          {error}
        </div>
      )}

      {places && (
        <ul
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 top-full mt-1 w-72 sm:w-80 rounded-lg bg-slate-800/95 border border-slate-600 shadow-lg backdrop-blur-sm overflow-hidden divide-y divide-slate-700/60"
        >
          {places.map((p, i) => (
            <li key={`${p.lat},${p.lon},${i}`} role="option" aria-selected={i === highlight}>
              <button
                onClick={() => pick(p)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full px-3 py-2 text-left transition-colors ${
                  i === highlight ? 'bg-slate-700' : ''
                }`}
              >
                <span className="block truncate text-sm text-slate-200">
                  {p.label}
                  {p.kind && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-300/90">
                      {p.kind}
                    </span>
                  )}
                </span>
                {p.description && (
                  <span className="block truncate text-xs text-slate-500">{p.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
