import { useCallback, useState } from 'react'
import { Place } from '../utils/geocode'
import { geoKey } from '../utils/points'

// Places searched by name — one of the three destination inputs. Searching
// registers the place (and it persists in the URL); its forecast arrives with
// the next Analyze, which folds the list into the ranked request alongside the
// CSV. Nothing here fetches — the app only fetches on an explicit Analyze.
export function useSearchedPlaces() {
  const [places, setPlaces] = useState<Place[]>([])

  // Callbacks rather than plain functions so their identities hold across a
  // render: two of them reach the memoized map as props (#337), and the effect
  // that seeds the URL's places depends on `restore`, which a fresh identity
  // would re-run over whatever the reader has added since. Each one reads the
  // list through the updater rather than out of the closure, so none of them
  // needs `places` and none of them takes a dependency.

  // Add a place, or refresh its details when the same feature is re-searched.
  const addPlace = useCallback((place: Place) => {
    const key = geoKey(place.lat, place.lon)
    setPlaces((prev) =>
      prev.some((p) => geoKey(p.lat, p.lon) === key)
        ? prev.map((p) => (geoKey(p.lat, p.lon) === key ? place : p))
        : [...prev, place],
    )
  }, [])

  const removePlace = useCallback((latitude: number, longitude: number) => {
    const key = geoKey(latitude, longitude)
    setPlaces((prev) => prev.filter((p) => geoKey(p.lat, p.lon) !== key))
  }, [])

  // Seed places restored from the URL at load.
  const restore = useCallback((restored: Place[]) => {
    if (restored.length > 0) setPlaces(restored)
  }, [])

  return { places, addPlace, removePlace, restore }
}
