import { useState } from 'react'
import { Place } from '../utils/geocode'
import { pinKey } from '../utils/customList'

// Places searched by name — one of the three destination inputs. Searching
// registers the place (and it persists in the URL); its forecast arrives with
// the next Analyze, which folds the list into the ranked request alongside the
// CSV. Nothing here fetches — the app only fetches on an explicit Analyze.
export function useSearchedPlaces() {
  const [places, setPlaces] = useState<Place[]>([])

  // Add a place, or refresh its details when the same feature is re-searched.
  function addPlace(place: Place) {
    const key = pinKey(place.lat, place.lon)
    setPlaces((prev) =>
      prev.some((p) => pinKey(p.lat, p.lon) === key)
        ? prev.map((p) => (pinKey(p.lat, p.lon) === key ? place : p))
        : [...prev, place],
    )
  }

  function removePlace(latitude: number, longitude: number) {
    const key = pinKey(latitude, longitude)
    setPlaces((prev) => prev.filter((p) => pinKey(p.lat, p.lon) !== key))
  }

  // The pins a restored state carries, replacing whatever is held. It takes
  // the list whole rather than adding to it, because a saved search being
  // loaded (#124) has to be able to leave the map with no pins — a restore
  // that could only ever add would carry the previous session's places into
  // the one being opened.
  function restore(restored: Place[]) {
    setPlaces(restored)
  }

  return { places, addPlace, removePlace, restore }
}
