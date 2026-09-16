import { describe, expect, it } from 'vitest'
import { dismissesPopups, resolveMapClick, type MapClickHits } from './mapClick'
import { SMOKE_CLICK_ORDER, smokeLayerId } from './smoke'

// Nothing under the cursor, not drawing, not pinning. Every case below is this
// with one thing switched on, which is how the precedence is read: the rule is
// about which of two hits wins, never about a single one.
const NOTHING: MapClickHits = {
  drawing: false,
  pinning: false,
  fire: false,
  result: false,
  poi: false,
  vertex: false,
  smoke: [],
}

const hits = (over: Partial<MapClickHits>): MapClickHits => ({ ...NOTHING, ...over })

const HEAVY = smokeLayerId('Heavy')
const LIGHT = smokeLayerId('Light')

describe('resolveMapClick', () => {
  it('does nothing for a click on bare map', () => {
    expect(resolveMapClick(NOTHING)).toEqual({ kind: 'none' })
  })

  // Smoke comes from fires, so a plume sits on the perimeter that made it. Two
  // handlers there would open a tab AND a popup for one click.
  it('opens the fire under a plume rather than the plume', () => {
    expect(resolveMapClick(hits({ fire: true, smoke: [HEAVY] }))).toEqual({ kind: 'open-fire' })
  })

  // A perimeter blocks a vertex either way, so the click may as well do the
  // useful thing.
  it('opens a fire even while drawing, where the click could not add a vertex', () => {
    expect(resolveMapClick(hits({ fire: true, drawing: true }))).toEqual({ kind: 'open-fire' })
  })

  it('adds a vertex for a click on bare map while drawing', () => {
    expect(resolveMapClick(hits({ drawing: true }))).toEqual({ kind: 'add-vertex' })
  })

  it('adds no vertex outside draw mode', () => {
    expect(resolveMapClick(NOTHING)).toEqual({ kind: 'none' })
  })

  // A marker is a small, deliberate target with a popup of its own; a vertex or
  // midpoint is a handle being grabbed. Neither may also drop a point.
  it('adds no vertex on a result marker or on a draw handle', () => {
    expect(resolveMapClick(hits({ drawing: true, result: true }))).toEqual({ kind: 'none' })
    expect(resolveMapClick(hits({ drawing: true, vertex: true }))).toEqual({ kind: 'none' })
  })

  // A plume can cover a whole state. Blocking on one would make large parts of
  // the map undrawable.
  it('adds a vertex through a plume', () => {
    expect(resolveMapClick(hits({ drawing: true, smoke: [HEAVY] }))).toEqual({ kind: 'add-vertex' })
  })

  // Outside draw mode a peak label is a destination; while drawing it is
  // scenery, and a polygon corner is allowed to land on it.
  it('adds a vertex through a peak or lake label', () => {
    expect(resolveMapClick(hits({ drawing: true, poi: true }))).toEqual({ kind: 'add-vertex' })
  })

  // Their own layer handlers own the click, and the general one must not open a
  // second card under the one they are opening.
  it('leaves a click on a result marker or a basemap label to its own handler', () => {
    expect(resolveMapClick(hits({ result: true, smoke: [HEAVY] }))).toEqual({ kind: 'none' })
    expect(resolveMapClick(hits({ poi: true, smoke: [HEAVY] }))).toEqual({ kind: 'none' })
  })

  it('describes the plume under a click on nothing else', () => {
    expect(resolveMapClick(hits({ smoke: [LIGHT] }))).toEqual({
      kind: 'open-smoke',
      layer: LIGHT,
    })
  })

  // HMS nests its plumes, so a click in the interesting place lands on three at
  // once and the reader means the densest.
  it('takes the densest of the plumes under one click', () => {
    const everything = [...SMOKE_CLICK_ORDER].reverse()
    expect(resolveMapClick(hits({ smoke: everything }))).toEqual({
      kind: 'open-smoke',
      layer: SMOKE_CLICK_ORDER[0],
    })
  })
})

describe('dismissesPopups', () => {
  it('clears the board for a click on bare map', () => {
    expect(dismissesPopups(NOTHING)).toBe(true)
  })

  // What pinning means: something the reader deliberately kept stays.
  it('keeps every popup while pinning', () => {
    expect(dismissesPopups(hits({ pinning: true }))).toBe(false)
    expect(dismissesPopups(hits({ pinning: true, fire: true }))).toBe(false)
  })

  // Those handlers do their own clearing, and this would otherwise close the
  // card they are about to open.
  it('leaves the clearing to a layer that opens a popup of its own', () => {
    expect(dismissesPopups(hits({ result: true }))).toBe(false)
    expect(dismissesPopups(hits({ poi: true }))).toBe(false)
    expect(dismissesPopups(hits({ smoke: [HEAVY] }))).toBe(false)
  })

  // A fire opens a tab rather than a popup, so it has no card to protect.
  it('clears the board on a fire and on a draw handle', () => {
    expect(dismissesPopups(hits({ fire: true }))).toBe(true)
    expect(dismissesPopups(hits({ drawing: true, vertex: true }))).toBe(true)
  })
})
