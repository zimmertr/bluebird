import { useEffect, useState } from 'react'
import { DestinationResult } from '../types'
import { fetchWildfires } from '../utils/wildfires'
import {
  FireWarning,
  FIRE_WARN_MILES,
  fireKey,
  nearestFire,
  pointsBbox,
} from '../utils/fireProximity'

// For each result within FIRE_WARN_MILES of an active US wildfire, returns a map
// (keyed by fireKey(lat, lon)) to its nearest-fire warning. Independent of the
// map overlay toggle — this is safety info, not a display option — and
// best-effort: any fetch failure or non-US area yields an empty map and never
// disturbs the displayed results.
export function useFireProximity(results: DestinationResult[]): Map<string, FireWarning> {
  const [warnings, setWarnings] = useState<Map<string, FireWarning>>(new Map())

  useEffect(() => {
    // Clear (without churning renders when already empty) when there's nothing
    // to check. `results` is memoized upstream, so this effect only re-runs when
    // a new analysis produces a new array — not on every render.
    const bbox = pointsBbox(results, FIRE_WARN_MILES + 1)
    if (!bbox) {
      setWarnings((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    const ac = new AbortController()
    let cancelled = false

    ;(async () => {
      try {
        // No geometry simplification — it would perturb perimeter distances.
        const fires = await fetchWildfires(bbox, undefined, ac.signal)
        if (cancelled) return
        const next = new Map<string, FireWarning>()
        for (const r of results) {
          const near = nearestFire(r.latitude, r.longitude, fires)
          if (near && near.miles <= FIRE_WARN_MILES) {
            next.set(fireKey(r.latitude, r.longitude), near)
          }
        }
        setWarnings(next)
      } catch (err) {
        if ((err as Error).name !== 'AbortError' && !cancelled) {
          setWarnings((prev) => (prev.size === 0 ? prev : new Map()))
        }
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [results])

  return warnings
}
