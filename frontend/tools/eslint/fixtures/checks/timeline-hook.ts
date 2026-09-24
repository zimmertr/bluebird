// Must trip: the playhead reset keyed on the times array, an unmemoized grid,
// and two effects where the timeline takes three.
import { useEffect } from 'react'
declare const times: number[]
export function useBar() {
  const forecastTimes = times
  useEffect(() => {}, [forecastTimes])
  useEffect(() => {}, [])
}
