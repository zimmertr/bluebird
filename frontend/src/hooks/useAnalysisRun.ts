import { useRef, useState } from 'react'
import { analysisFailure } from '../utils/analysisFailure'
import type { ForecastModelOption } from './useCapabilities'
import { usePacedFetch } from './usePacedFetch'
import type { Progress, Refusal } from './analyzeTypes'

// The state of the analysis in flight: whether one runs, what it says it is
// doing, how far it has got, and how it failed. Apart from the report it
// produces (useAnalysisRun owns none of the rows) because the two reset on
// different events: this clears when a run starts, the report only when a new
// one commits.

export interface RunHooks {
  // A run that did not finish, cancelled or failed.
  onFailure: () => void
  // Any run ending, whatever the outcome.
  onSettled: () => void
}

export function useAnalysisRun(models: readonly ForecastModelOption[]) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  // The overlay's live countdown while the client pacer sleeps off a quota
  // deficit. Shared with the forecast grid and the model comparison, which
  // sleep against the same budget (#394).
  const { paceRemainingS, onPace, clear: clearPace } = usePacedFetch()
  const abortRef = useRef<AbortController | null>(null)

  // Abort the in-flight request. The fetch loops swallow AbortError so no
  // error banner shows: the user chose to stop.
  function cancel() {
    abortRef.current?.abort()
  }

  // Clear the event states. Also the first thing a run does, which is what
  // makes an identical error from the next Analyze show again (notices.ts).
  function clearEvents() {
    setError(null)
    setRefusal(null)
  }

  // Announce the retrieval phase with the final count the moment discovery
  // settles, like the streaming endpoint's up-front progress event.
  function announce(total: number) {
    setProgress({ processed: 0, total, percent: 0 })
  }

  function onProgress(processed: number, total: number, message: string) {
    clearPace()
    setStatusMessage(message)
    setProgress({ processed, total, percent: total ? Math.round((processed / total) * 100) : 100 })
  }

  // One run. `seed` is the first-phase label, so nothing generic flashes in
  // the gap between the click and the first event.
  async function run(seed: string, body: (signal: AbortSignal) => Promise<void>, hooks: RunHooks) {
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    clearEvents()
    setProgress(null)
    clearPace()
    setStatusMessage(seed)
    try {
      await body(controller.signal)
    } catch (e) {
      hooks.onFailure()
      const failure = analysisFailure(e, models)
      if (failure.kind === 'cancel') setStatusMessage(null)
      else if (failure.kind === 'refusal') setRefusal({ message: failure.message })
      else setError(failure.message)
    } finally {
      abortRef.current = null
      setLoading(false)
      hooks.onSettled()
      setStatusMessage(null)
      setProgress(null)
      clearPace()
    }
  }

  return {
    run,
    cancel,
    clearEvents,
    announce,
    onProgress,
    onPace,
    loading,
    error,
    refusal,
    statusMessage,
    progress,
    paceRemainingS,
  }
}
