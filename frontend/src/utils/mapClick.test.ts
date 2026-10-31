import { describe, expect, it } from 'vitest'
import {
  DRAW_TARGETS,
  MAP_TARGETS,
  POINT_TARGETS,
  mapCursor,
  pointTargetsToAsk,
  rankedTargets,
  resolveMapClick,
  type MapTarget,
} from './mapClick'

// Every case is about which of two or more targets wins, because a single
// target under the cursor always wins alone.
describe('resolveMapClick', () => {
  it('does nothing for a click on bare map', () => {
    expect(resolveMapClick(false, [])).toEqual({ kind: 'none' })
  })

  it('opens a lone target', () => {
    for (const target of MAP_TARGETS) {
      expect(resolveMapClick(false, [target])).toEqual({ kind: 'open', target })
    }
  })

  // The complaint that set the rank (TJ, 2026-10-08): a destination inside a
  // fire or a closure could not be selected, because the shape around it took
  // the click.
  it('gives a destination inside a fire or a closure the click', () => {
    for (const shape of ['fire', 'closure-area', 'closure-trail', 'smoke'] as const) {
      expect(resolveMapClick(false, [shape, 'result'])).toEqual({ kind: 'open', target: 'result' })
      expect(resolveMapClick(false, [shape, 'poi'])).toEqual({ kind: 'open', target: 'poi' })
    }
  })

  // A closure is often drawn around the fire that caused it, and a plume over
  // both; the perimeter is the smaller shape and the hazard itself.
  it('opens the fire inside a closure and under a plume', () => {
    expect(resolveMapClick(false, ['smoke', 'closure-area', 'fire'])).toEqual({ kind: 'open', target: 'fire' })
  })

  // A star is drawn over the perimeter, the closure and the label it lands on
  // (#799), so the click is the star's; a marker drawn over the star keeps its own.
  it('opens a fire detection over every shape and label under it, and under a marker', () => {
    expect(resolveMapClick(false, ['smoke', 'closure-area', 'fire', 'closure-trail', 'poi', 'fire-activity'])).toEqual({
      kind: 'open',
      target: 'fire-activity',
    })
    expect(resolveMapClick(false, ['fire-activity', 'result'])).toEqual({ kind: 'open', target: 'result' })
  })

  it('opens a closed trail over the fire and the closed ground it crosses', () => {
    expect(resolveMapClick(false, ['closure-area', 'fire', 'closure-trail'])).toEqual({
      kind: 'open',
      target: 'closure-trail',
    })
  })

  it('reads the rank in order: each target outranks every one after it', () => {
    MAP_TARGETS.forEach((higher, i) => {
      for (const lower of MAP_TARGETS.slice(i + 1)) {
        expect(resolveMapClick(false, [lower, higher])).toEqual({ kind: 'open', target: higher })
      }
    })
  })
})

describe('resolveMapClick while drawing', () => {
  it('adds a vertex for a click on bare map', () => {
    expect(resolveMapClick(true, [])).toEqual({ kind: 'add-vertex' })
  })

  // A ring may be drawn inside a fire or a closure (TJ, 2026-10-08), where a
  // perimeter used to swallow the click.
  it('treats every overlay and basemap label as scenery a corner lands on', () => {
    const scenery = MAP_TARGETS.filter((t) => !DRAW_TARGETS.includes(t))
    expect(scenery).toEqual(['fire-activity', 'poi', 'closure-trail', 'fire', 'closure-area', 'smoke', 'radar', 'snow'])
    expect(resolveMapClick(true, scenery)).toEqual({ kind: 'add-vertex' })
  })

  it('still opens a ring handle or a marker, and the handle first', () => {
    expect(resolveMapClick(true, ['fire', 'result'])).toEqual({ kind: 'open', target: 'result' })
    expect(resolveMapClick(true, ['result', 'vertex'])).toEqual({ kind: 'open', target: 'vertex' })
  })
})

// Who a click falls to when the target above finds nothing to open there.
describe('rankedTargets', () => {
  it('lists every live target under the cursor, highest first', () => {
    expect(rankedTargets(false, ['smoke', 'poi', 'fire'])).toEqual(['poi', 'fire', 'smoke'])
    expect(rankedTargets(true, ['smoke', 'result', 'fire', 'vertex'])).toEqual(['vertex', 'result'])
    // A pending dot opens its card only while no ring is drawn, so it never
    // swallows a corner placed around it (#832).
    expect(resolveMapClick(true, ['pending'])).toEqual({ kind: 'add-vertex' })
    expect(resolveMapClick(false, ['poi', 'pending'])).toEqual({ kind: 'open', target: 'pending' })
    expect(rankedTargets(true, ['fire'])).toEqual([])
  })
})

describe('mapCursor', () => {
  const cases: [boolean, MapTarget[], string][] = [
    [false, [], ''],
    [false, ['fire'], 'pointer'],
    [false, ['smoke', 'result'], 'pointer'],
    [true, [], 'crosshair'],
    // Over a fire in draw mode the next click places a point, so the
    // crosshair stays.
    [true, ['fire'], 'crosshair'],
    [true, ['result'], 'pointer'],
    [true, ['vertex'], 'grab'],
  ]
  it.each(cases)('drawing %s over %j reads %j', (drawing, under, cursor) => {
    expect(mapCursor(drawing, under)).toBe(cursor)
  })
})

describe('pointTargetsToAsk', () => {
  // A picture is asked only once every shape has passed, so it ranks under
  // all of them, and rain over snow is what the card leads with (#737).
  it('ranks the pictures under every shape, the radar over the snow', () => {
    expect(MAP_TARGETS.slice(-POINT_TARGETS.length)).toEqual(['radar', 'snow'])
  })

  it('asks the pictures that are on, in rank order', () => {
    expect(pointTargetsToAsk(false, ['snow', 'radar'])).toEqual(['radar', 'snow'])
    expect(pointTargetsToAsk(false, ['snow'])).toEqual(['snow'])
    expect(pointTargetsToAsk(false, [])).toEqual([])
  })

  it('asks none of them while the ring is drawn', () => {
    expect(pointTargetsToAsk(true, ['radar', 'snow'])).toEqual([])
  })

  it('never asks a shape as though it were a picture', () => {
    expect(pointTargetsToAsk(false, ['smoke', 'fire', 'radar'])).toEqual(['radar'])
  })
})
