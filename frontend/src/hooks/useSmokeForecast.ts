/**
 * The forecast-smoke overlay's one fetch (#298).
 *
 * Far simpler than `useForecastGrid`, and for one reason: the server answers
 * with every hour of the window at once. There is no chunking, no pacing and no
 * ratchet here, because there is nothing to spend — a Cascades-sized box
 * measured 0.4 KB per hour, and the pod is serving a snapshot it already holds
 * rather than reaching upstream per visitor.
 *
 * Keyed on `(enabled, analysisSeq, box, window)`. The toggle is the spend gate
 * and leaving it on is standing consent for the next analysis, exactly as the
 * forecast grid's is. The inputs come from the `analyzed` snapshot rather than
 * from panel state, so this layer can never paint hours the committed report
 * never saw.
 *
 * Null universe means no layer: on the server SSE path the browser holds only
 * the trimmed rows, so there is no field to box.
 */

import { useEffect, useState } from 'react'
import { DestinationResult } from '../types'
import {
  SmokeForecastResponse,
  fetchSmokeForecast,
  fieldBox,
} from '../utils/smokeForecast'

export type SmokeForecastStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface SmokeForecastState {
  status: SmokeForecastStatus
  response: SmokeForecastResponse | null
}

export interface SmokeForecastInputs {
  /** The layer's toggle. Off means no fetch and no held response. */
  enabled: boolean
  /** The analyzed field, which the box is drawn around. */
  field: readonly DestinationResult[] | null
  /** The report's hourly grid. Its ends are the window asked for. */
  times: readonly number[]
  /** Bumped once per committed analysis; refetches even for an identical field. */
  analysisSeq: number
}

const IDLE: SmokeForecastState = { status: 'idle', response: null }

export function useSmokeForecast(inputs: SmokeForecastInputs): SmokeForecastState {
  const { enabled, field, times, analysisSeq } = inputs
  const [state, setState] = useState<SmokeForecastState>(IDLE)

  const box = enabled ? fieldBox(field) : null
  // The window's ends, and the identity the effect keys on. Strings rather than
  // the arrays themselves: `times` is rebuilt on every live knob change, so
  // keying on the reference would abort the request in flight and refetch the
  // same question on every twiddle.
  const startMs = times.length > 0 ? times[0] : null
  const endMs = times.length > 0 ? times[times.length - 1] : null
  const boxKey = box === null ? '' : `${box.west},${box.south},${box.east},${box.north}`

  useEffect(() => {
    if (!enabled || box === null || startMs === null || endMs === null) {
      setState((prev) => (prev === IDLE ? prev : IDLE))
      return
    }

    const controller = new AbortController()
    let live = true
    setState({ status: 'loading', response: null })

    fetchSmokeForecast(box, startMs, endMs, controller.signal)
      .then((response) => {
        if (live) setState({ status: 'ready', response })
      })
      .catch((error) => {
        if (!live || controller.signal.aborted) return
        // Logged rather than swallowed: a layer that draws nothing and says
        // nothing is indistinguishable from one that found no smoke, which is
        // the failure mode the wildfire check had to grow a status to fix.
        console.warn('Forecast smoke unavailable', error)
        setState({ status: 'failed', response: null })
      })

    return () => {
      live = false
      controller.abort()
    }
    // `box` is rebuilt per render; `boxKey` is its value, which is what should
    // decide whether to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, analysisSeq, boxKey, startMs, endMs])

  return state
}
