import { describe, expect, it } from 'vitest'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import {
  CLOSURE_STATE_PROBES,
  CLOSURE_UNAVAILABLE_NOTE,
  CLOSURE_UNCOVERED_NOTE,
  closureCellText,
  closureFor,
  closureUncoveredNote,
  closureWarningText,
  coveredStates,
} from './closureProximity'
import { closureFeature, closureWarning } from '../testSupport/fixtures'

// A 0.2° square closure near (45.6, -121.9), with a 0.04° hole in its middle.
const OUTER = [
  [-122.0, 45.5],
  [-121.8, 45.5],
  [-121.8, 45.7],
  [-122.0, 45.7],
  [-122.0, 45.5],
]
const HOLE = [
  [-121.92, 45.58],
  [-121.88, 45.58],
  [-121.88, 45.62],
  [-121.92, 45.62],
  [-121.92, 45.58],
]
const SQUARE: Polygon = { type: 'Polygon', coordinates: [OUTER, HOLE] }
const areas = (...features: FeatureCollection['features']): FeatureCollection => ({
  type: 'FeatureCollection',
  features,
})

describe('closureFor', () => {
  it('names the closure a point stands inside, with its page and its centre', () => {
    const hit = closureFor(45.55, -121.95, areas(closureFeature({}, SQUARE)))!
    expect(hit).toMatchObject({ name: 'Probe Fire Closure', url: 'https://www.fs.usda.gov/r06/alerts/probe' })
    expect(hit.latitude).toBeCloseTo(45.6)
    expect(hit.longitude).toBeCloseTo(-121.9)
  })

  it('finds nothing for a point outside every closure, however close', () => {
    expect(closureFor(45.55, -121.79, areas(closureFeature({}, SQUARE)))).toBeNull()
  })

  // An island of open ground inside a closure is still reached through it.
  it('ignores holes', () => {
    expect(closureFor(45.6, -121.9, areas(closureFeature({}, SQUARE)))?.name).toBe('Probe Fire Closure')
  })

  it('reads every polygon of a multipolygon', () => {
    const far = OUTER.map(([lon, lat]) => [lon + 1, lat])
    const multi = closureFeature({}, { type: 'MultiPolygon', coordinates: [[OUTER], [far]] })
    expect(closureFor(45.55, -120.95, areas(multi))).not.toBeNull()
  })

  it('takes the first closure that holds the point', () => {
    const second = closureFeature({ ClosureOrderName: 'Second' }, SQUARE)
    expect(closureFor(45.55, -121.95, areas(closureFeature({}, SQUARE), second))?.name).toBe(
      'Probe Fire Closure',
    )
  })

  it('never tests a line or a point, which close no ground', () => {
    expect(closureFor(45.6, -121.9, areas(closureFeature()))).toBeNull()
  })

  it('falls back to the order number and drops a page that is not http(s)', () => {
    const odd = closureFeature({ ClosureOrderName: ' ', ClosureURLlink: 'javascript:alert(1)' }, SQUARE)
    expect(closureFor(45.55, -121.95, areas(odd))).toMatchObject({ name: '06-22-00-26-01', url: null })
  })
})

describe('closureCellText', () => {
  it('carries the flag beside the name for a warned row', () => {
    expect(closureCellText(closureWarning(), false)).toBe('⚠️ Probe Fire Closure')
  })

  it('is the dash for a row the check cleared', () => {
    expect(closureCellText(undefined, false)).toBe('—')
  })

  it('is N/A for a row outside the coverage', () => {
    expect(closureCellText(undefined, true)).toBe('N/A')
  })
})

describe('closure notes', () => {
  it('phrases a warning', () => {
    expect(closureWarningText(closureWarning())).toBe('Inside an active closure (Probe Fire Closure)')
  })

  it('pins the approved N/A hover sentences', () => {
    expect(CLOSURE_UNCOVERED_NOTE).toBe('Forest Service closure data is only available in Arizona, Idaho, Nevada, New Mexico, Oregon, Utah, Washington and Wyoming')
    expect(CLOSURE_UNAVAILABLE_NOTE).toBe('The Forest Service is unreachable, so closure data is unavailable.')
  })
})

// A 0.1° square around each named state's probe, standing in for the rings
// the server composes from the regions whose feeds answered.
const outlineOf = (...states: string[]): MultiPolygon => ({
  type: 'MultiPolygon',
  coordinates: CLOSURE_STATE_PROBES.filter(([state]) => states.includes(state)).map(([, lat, lon]) => [
    [
      [lon - 0.1, lat - 0.1],
      [lon + 0.1, lat - 0.1],
      [lon + 0.1, lat + 0.1],
      [lon - 0.1, lat + 0.1],
      [lon - 0.1, lat - 0.1],
    ],
  ]),
})
const ALL_STATES = CLOSURE_STATE_PROBES.map(([state]) => state)

describe('the uncovered note, from the live outline (#567)', () => {
  it('is the approved sentence exactly while every region answers', () => {
    expect(closureUncoveredNote(coveredStates(outlineOf(...ALL_STATES)))).toBe(CLOSURE_UNCOVERED_NOTE)
  })

  it('leaves out the states of a region whose feed failed', () => {
    // Region 3 (Arizona and New Mexico) missing from the outline.
    const states = coveredStates(outlineOf('Idaho', 'Nevada', 'Oregon', 'Utah', 'Washington', 'Wyoming'))
    expect(states).toEqual(['Idaho', 'Nevada', 'Oregon', 'Utah', 'Washington', 'Wyoming'])
    expect(closureUncoveredNote(states)).toBe(
      'Forest Service closure data is only available in Idaho, Nevada, Oregon, Utah, Washington and Wyoming',
    )
  })

  it('keeps every state when the server published no outline', () => {
    expect(coveredStates(undefined)).toEqual(ALL_STATES)
  })

  it('falls back to the unavailable sentence when the outline holds no state', () => {
    expect(closureUncoveredNote(coveredStates({ type: 'MultiPolygon', coordinates: [] }))).toBe(
      CLOSURE_UNAVAILABLE_NOTE,
    )
  })
})
