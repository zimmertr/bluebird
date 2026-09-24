import { useCallback, useRef, useState, type RefObject } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { TourUi } from '../tour/runTour'
import type { WindowLimits } from '../utils/forecastWindow'
import type { TourScene } from '../utils/tourScene'

// The tutorial's state in the app (#536): whether it runs, which makes the app
// root inert, and the demo scene the report's surfaces read while it is set.
// Everything that runs it lives in `tour/runTour.ts`, imported on the first
// press, so the page carries only this until a reader asks for the tutorial.

export function useTour({
  mapRef,
  windowLimits,
}: {
  mapRef: RefObject<MapViewHandle | null>
  windowLimits: WindowLimits
}) {
  const [active, setActive] = useState(false)
  const [scene, setScene] = useState<TourScene | null>(null)
  // Assigned by the caller in a layout effect, after the hooks that own this
  // state exist: the tutorial is started before them in App's order, and a
  // run reads them when a step moves rather than when the app renders.
  const uiRef = useRef<TourUi | null>(null)
  // Set from the first press until the run ends, the chunk's load included,
  // so a second press cannot start a second tutorial.
  const runningRef = useRef(false)

  const start = useCallback(async () => {
    if (runningRef.current || !uiRef.current) return
    runningRef.current = true
    try {
      const { runTour } = await import('../tour/runTour')
      setActive(true)
      runTour(
        {
          ui: () => uiRef.current,
          map: () => mapRef.current,
          showScene: setScene,
          ended: () => {
            runningRef.current = false
            setScene(null)
            setActive(false)
          },
        },
        windowLimits,
      )
    } catch {
      // The chunk did not load (offline, or a deploy replaced it). The press
      // does nothing rather than leaving the page inert.
      runningRef.current = false
      setActive(false)
    }
  }, [mapRef, windowLimits])

  return { active, scene, start, uiRef }
}
