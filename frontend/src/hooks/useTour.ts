import { useCallback, useRef, useState } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { Place } from '../utils/geocode'
import type { ShareableState } from '../utils/urlState'
import type { DestinationResult } from '../types'

// The tutorial's state in the reader's app (#536): whether it runs, which
// hides the reader's app and makes it inert while a second, demo copy of the
// app stands over it. Everything that runs it lives in `tour/runTour.ts`,
// imported on the first press, so the page carries only this until a reader
// asks for the tutorial.

/** What the demo copy of the app lends the tutorial, read fresh at every move. */
export interface SandboxHandle {
  isDesktop: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  setShowResults: (show: boolean) => void
  resultsCollapsed: boolean
  toggleCollapsed: () => void
  map: MapViewHandle | null
  /** The live limits have landed and been applied. */
  settled: boolean
  loading: boolean
  analysisSeq: number
  results: DestinationResult[]
  /** Adds a place the way a click on the map does. */
  addPlace: (place: Place) => void
}

/**
 * What makes an `App` the tutorial's copy: where its state starts in place of
 * the address bar, whether it analyzes on open in place of `analyze=1`, and
 * the box it reports itself through.
 */
export interface Sandbox {
  initial: Partial<ShareableState>
  autoAnalyze: boolean
  handle: { current: SandboxHandle | null }
}

/** The reader's forecast player, which the tutorial pauses and plays again. */
export interface ReaderPlayback {
  playing: boolean
  setPlaying: (playing: boolean) => void
}

export function useTour() {
  const [active, setActive] = useState(false)
  // Assigned by the caller in a layout effect: the player is built after this
  // hook in App's order, and a run reads it when it starts and ends.
  const playbackRef = useRef<ReaderPlayback | null>(null)
  // Set from the first press until the run ends, the chunk's load included,
  // so a second press cannot start a second tutorial.
  const runningRef = useRef(false)

  const start = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      const { runTour } = await import('../tour/runTour')
      // A playing player would go on stepping the reader's hidden map and
      // radar under the demo.
      const wasPlaying = playbackRef.current?.playing ?? false
      if (wasPlaying) playbackRef.current?.setPlaying(false)
      setActive(true)
      runTour({
        ended: () => {
          runningRef.current = false
          setActive(false)
          if (wasPlaying) playbackRef.current?.setPlaying(true)
        },
      })
    } catch {
      // The chunk did not load (offline, or a deploy replaced it). The press
      // does nothing rather than leaving the page hidden.
      runningRef.current = false
      setActive(false)
    }
  }, [])

  return { active, start, playbackRef }
}
