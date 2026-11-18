import { useEffect, useState } from 'react'
import { FORECAST_REUSE_MS, heldStillYoung } from '../utils/forecastReuse'

const systemClock = () => Date.now()

/**
 * Whether the held forecasts may still stand in for a fresh fetch, for the
 * Forecast button's count (`forecastLabel`). It renders again the moment they
 * age out, so `Forecast 31 new` turns back into the whole field's count
 * without waiting for something else to move.
 */
export function useHeldYoung(sinceMs: number | null, now: () => number = systemClock): boolean {
  const [, setAged] = useState(0)
  useEffect(() => {
    if (sinceMs === null) return
    const left = sinceMs + FORECAST_REUSE_MS - now()
    if (left <= 0) return
    const id = setTimeout(() => setAged((n) => n + 1), left)
    return () => clearTimeout(id)
  }, [sinceMs, now])
  return heldStillYoung(sinceMs, now())
}
