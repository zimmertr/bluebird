import { useCallback, useEffect, useReducer } from 'react'
import { paceReducer, paceRemainingS } from '../utils/pacing'

/**
 * One live countdown for a fetch the shared Open-Meteo budget is holding back
 * (#394).
 *
 * Wiring only. What a wait IS, and how it is worded, live in `utils/pacing.ts`
 * so they can be tested under the node-env Vitest; this is the part that cannot
 * be — the state, and the tick that keeps the number honest.
 *
 * Every caller of `fetchWeather` that has somewhere to say so should hand
 * `onPace` over. A paced fetch with no countdown is indistinguishable from a
 * hung one, which is the whole of what the comparison used to look like.
 */
export interface PacedFetch {
  /** Seconds until the pacer resumes, or null when nothing is waiting. */
  paceRemainingS: number | null
  /** Pass straight to `fetchWeather`'s `onPace`. */
  onPace: (seconds: number) => void
  /** The wait is over: samples landed, the fetch finished, or it was aborted. */
  clear: () => void
}

export function usePacedFetch(): PacedFetch {
  const [endMs, dispatch] = useReducer(paceReducer, null as number | null)

  const onPace = useCallback((seconds: number) => {
    dispatch({ kind: 'pace', seconds, nowMs: Date.now() })
  }, [])
  const clear = useCallback(() => dispatch({ kind: 'clear' }), [])

  // A tick only while the pacer is actually asleep, so the number moves. It
  // stops on its own: `endMs` goes back to null the moment the wait ends, and
  // nothing else on screen needs a second hand.
  //
  // The tick forces the re-render; the VALUE is read from the clock below, so
  // what shows is right for the frame it is painted in rather than for the
  // last tick that happened to fire.
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (endMs === null) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endMs, tick])

  return { paceRemainingS: paceRemainingS(endMs, Date.now()), onPace, clear }
}
