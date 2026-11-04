import { vi } from 'vitest'
import type { MapPointTarget, MapPopups } from '../map/mapPopups'
import type { MapTarget } from '../utils/mapClick'

// The popup system as an overlay that registers a point target sees it, for
// a test of that overlay alone: what was registered, which owners were
// closed, which spots were opened, and which layers asked for the open cards
// to be read again (#748, #832). A file of its own because it imports types
// alone, so a test that uses it needs no stand-in for MapLibre's Popup, which
// `mapPopups.ts` beside it makes for real.
export function fakeMapPopups() {
  const points: MapPointTarget[] = []
  const closed: (MapTarget | undefined)[] = []
  const refreshed: MapTarget[] = []
  const spots: unknown[] = []
  const popups = {
    register: vi.fn(),
    registerPoint: (target: MapPointTarget) => points.push(target),
    registerSpot: vi.fn(),
    openSpot: (at: unknown) => spots.push(at),
    pointKinds: () => points.filter((p) => p.shown()).map((p) => p.target),
    readPoint: vi.fn(),
    onPointChange: vi.fn(),
    refreshPoint: (target: MapTarget) => refreshed.push(target),
    openCard: vi.fn(),
    openBare: vi.fn(),
    closeAll: (owner?: MapTarget) => closed.push(owner),
    bodyCap: () => null,
    refit: () => null,
    cardBounds: () => ({ width: { min: 180, max: 780 }, body: { min: 48, max: 560 } }),
    sizeCard: (_popup: unknown, width: number) => width,
    holdCard: () => {},
  } as unknown as MapPopups
  return { popups, points, closed, refreshed, spots }
}
