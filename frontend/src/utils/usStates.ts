import type { Position } from 'geojson'
import { distanceToRingMiles, pointInRing } from './fireProximity'

// Which of the fifty states a point stands in, for the one thing that asks:
// a crag's Mountain Project search (`destinationUrl.ts`). Mountain Project
// files every US area under its state, and its search matches the words of an
// area's path as well as its name, so `Family Wall Washington` lists the one
// Family Wall at Little Si where `Family Wall` lists North Carolina's,
// California's and Colorado's before it (measured 2026-10-22).
//
// The outlines are the Census Bureau's 2024 cartographic boundaries (public
// domain), rebuilt by `frontend/tools/us-states/build.sh` with every border
// between two states kept to 250 m and every coast to 1 km, 3 km in Alaska and
// Hawaii, because only a border decides which state a crag is in. Against the
// full-resolution outlines, 80,000 random points (2026-10-22) found a wrong
// state only within 95 m of a state line, and a state given to sea or foreign
// land only within the coast's own tolerance of it. That last is why the reach
// below is the coast's tolerance and no more: a Canadian crag a few kilometres
// over the border must find no state, since `Name Washington` would then find
// nothing at all, where `Name` alone still lists it.

/** The generated file: quantized arcs and, per state, its rings by arc. */
export interface UsStateOutlines {
  scale: [number, number]
  translate: [number, number]
  /** Each arc's alternating x and y deltas, in quantized units. */
  arcs: number[][]
  /** Name, the coast's tolerance in metres, and rings as arc indexes (~i reverses arc i). */
  states: [string, number, number[][]][]
}

interface Ring {
  points: Position[]
  west: number
  south: number
  east: number
  north: number
}

interface StateShape {
  name: string
  reachMiles: number
  rings: Ring[]
}

export type UsStates = readonly StateShape[]

const METRES_PER_MILE = 1609.344

export function decodeUsStates(file: UsStateOutlines): UsStates {
  const [sx, sy] = file.scale
  const [tx, ty] = file.translate
  const arcs = file.arcs.map((deltas) => {
    const points: Position[] = []
    let x = 0
    let y = 0
    for (let i = 0; i < deltas.length; i += 2) {
      x += deltas[i]
      y += deltas[i + 1]
      points.push([x * sx + tx, y * sy + ty])
    }
    return points
  })
  const ring = (ids: number[]): Ring => {
    const points: Position[] = []
    for (const id of ids) {
      const arc = id >= 0 ? arcs[id] : arcs[~id].slice().reverse()
      // Consecutive arcs share their joining point.
      points.push(...(points.length > 0 ? arc.slice(1) : arc))
    }
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const [x, y] of points) {
      west = Math.min(west, x)
      south = Math.min(south, y)
      east = Math.max(east, x)
      north = Math.max(north, y)
    }
    return { points, west, south, east, north }
  }
  return file.states.map(([name, coastM, rings]) => ({
    name,
    reachMiles: coastM / METRES_PER_MILE,
    rings: rings.map(ring),
  }))
}

// Inside a state when inside an odd number of its rings, so a ring that is a
// hole in another counts as one.
function inside(state: StateShape, lon: number, lat: number): boolean {
  let n = 0
  for (const r of state.rings) {
    if (lon < r.west || lon > r.east || lat < r.south || lat > r.north) continue
    if (pointInRing(lon, lat, r.points)) n++
  }
  return n % 2 === 1
}

function distanceMiles(state: StateShape, lon: number, lat: number): number {
  // A degree of latitude is 69 miles, and a degree of longitude at least a
  // quarter of that short of 75° north, which Alaska stops below, so a ring
  // whose box is further off than these pads is further off than the reach.
  const pad = state.reachMiles / 69
  let min = Infinity
  for (const r of state.rings) {
    if (lon < r.west - pad * 4 || lon > r.east + pad * 4 || lat < r.south - pad || lat > r.north + pad) continue
    min = Math.min(min, distanceToRingMiles(lon, lat, r.points))
  }
  return min
}

/**
 * The state the point stands in, else the nearest whose simplified coast it
 * is within the tolerance of (a sea cliff the coarse coast cut off), else
 * null: outside the fifty states, or on an island under 5 km² the outlines
 * leave out.
 */
export function usStateAt(states: UsStates, lat: number, lon: number): string | null {
  for (const state of states) if (inside(state, lon, lat)) return state.name
  let best: string | null = null
  let bestMiles = Infinity
  for (const state of states) {
    const d = distanceMiles(state, lon, lat)
    if (d <= state.reachMiles && d < bestMiles) {
      best = state.name
      bestMiles = d
    }
  }
  return best
}
