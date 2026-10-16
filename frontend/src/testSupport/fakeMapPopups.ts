import { vi } from 'vitest'
import type { MapPointTarget, MapPopups } from '../map/mapPopups'
import type { MapTarget } from '../utils/mapClick'

// The popup system as an overlay that registers a point target and closes its
// own cards sees it, for a test of that overlay alone: what was registered,
// which owners were closed, and which asked for their open cards to be read
// again (#748). A file of its own because it imports types
// alone, so a test that uses it needs no stand-in for MapLibre's Popup, which
// `mapPopups.ts` beside it makes for real.
export function fakeMapPopups() {
  const points: MapPointTarget[] = []
  const closed: (MapTarget | undefined)[] = []
  const refreshed: MapTarget[] = []
  const popups = {
    register: vi.fn(),
    registerPoint: (target: MapPointTarget) => points.push(target),
    refreshPoint: (target: MapTarget) => refreshed.push(target),
    openCard: vi.fn(),
    openBare: vi.fn(),
    closeAll: (owner?: MapTarget) => closed.push(owner),
  } as unknown as MapPopups
  return { popups, points, closed, refreshed }
}
