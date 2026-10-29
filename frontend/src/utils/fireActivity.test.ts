import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Feature, Point } from 'geojson'
import type { FireActivityResponse, FireDetectionProps } from '../types'
import { contrast } from '../testSupport/contrast'
import { fakeResponse } from '../testSupport/fixtures'
import {
  AGE_BANDS,
  AGE_BAND_CHIPS,
  FIRE_ACTIVITY_FILLS,
  FIRE_ACTIVITY_STROKE,
  STARBURST_INNER,
  STARBURST_POINTS,
  ageBand,
  fetchFireActivity,
  fireActivityLegendChips,
  starburst,
  fireActivityQueryUrl,
  withAgeBands,
} from './fireActivity'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-10-27T20:00:00Z')

describe('ageBand', () => {
  it('reads three bands of 12, 24 and 48 hours', () => {
    expect(AGE_BANDS).toEqual([12, 24, 48])
    expect(ageBand(NOW - 1 * HOUR, NOW)).toBe(0)
    expect(ageBand(NOW - 18 * HOUR, NOW)).toBe(1)
    expect(ageBand(NOW - 36 * HOUR, NOW)).toBe(2)
  })

  // Each band holds its lower edge, so the moment a detection turns 12 hours
  // old it is orange, and at 24 yellow. Exactly 48 hours is still drawn and a
  // millisecond more is not.
  it('puts each boundary instant in the older band, and keeps 48 hours exactly', () => {
    expect(ageBand(NOW - 12 * HOUR + 1, NOW)).toBe(0)
    expect(ageBand(NOW - 12 * HOUR, NOW)).toBe(1)
    expect(ageBand(NOW - 24 * HOUR + 1, NOW)).toBe(1)
    expect(ageBand(NOW - 24 * HOUR, NOW)).toBe(2)
    expect(ageBand(NOW - 48 * HOUR, NOW)).toBe(2)
    expect(ageBand(NOW - 48 * HOUR - 1, NOW)).toBeNull()
  })

  it('reads a stamp ahead of the clock as new and an unreadable one as nothing', () => {
    expect(ageBand(NOW + 5 * 60 * 1000, NOW)).toBe(0)
    expect(ageBand(Number.NaN, NOW)).toBeNull()
  })
})

function detection(acquired: string): Feature<Point, FireDetectionProps> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-121.5, 47.5] },
    properties: { acquired, instrument: 'VIIRS', satellite: 'N20', confidence: 'nominal', frp: 3.2 },
  }
}

function collection(...acquired: string[]): FireActivityResponse {
  return { type: 'FeatureCollection', fetched_at: NOW, features: acquired.map(detection) }
}

describe('withAgeBands', () => {
  it('bands every detection it can draw and leaves out the rest', () => {
    const fc = collection('2026-10-27T19:00:00Z', '2026-10-27T06:00:00Z', '2026-10-26T12:00:00Z', '2026-10-25T12:00:00Z', 'soon')
    const { data, bands } = withAgeBands(fc, NOW)
    expect(data.features.map((f) => f.properties.band)).toEqual([0, 1, 2])
    expect(bands).toBe('012--')
    // The route's own properties ride along for any later reader.
    expect(data.features[0].properties.satellite).toBe('N20')
  })

  // The layer reads the bands again every minute and repaints only when one
  // moved; the string it compares is this.
  it('changes its bands only when a detection crosses a boundary', () => {
    const fc = collection('2026-10-27T08:00:30Z')
    expect(withAgeBands(fc, NOW).bands).toBe('0')
    expect(withAgeBands(fc, NOW + 60 * 1000).bands).toBe('1')
  })
})

describe('fireActivityQueryUrl', () => {
  it('asks the pod rather than FIRMS, for the box as west,south,east,north', () => {
    const url = new URL(fireActivityQueryUrl([-125, 31, -102, 49]), 'http://x')
    expect(url.pathname).toBe('/api/fire-activity')
    expect(url.searchParams.get('bbox')).toBe('-125,31,-102,49')
  })
})

describe('fetchFireActivity', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers the collection the pod sent', async () => {
    const body = collection('2026-10-27T19:00:00Z')
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(body)))
    expect(await fetchFireActivity([0, 0, 1, 1], new AbortController().signal)).toEqual(body)
  })

  it('marks a 503 as a wait, with the pod Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ detail: 'x' }, 503, { 'Retry-After': '60' })),
    )
    await expect(fetchFireActivity([0, 0, 1, 1], new AbortController().signal)).rejects.toMatchObject({
      rateLimited: true,
      retryAfterS: 60,
    })
  })
})

// Each disc reads on two grounds: Liberty's pale land, carried by its stroke,
// and dark forest under the satellite imagery, carried by its fill. The grounds
// are the two the module's comment measured; the numbers there are these.
const LIBERTY_LAND = '#efece6'
const DARK_FOREST = '#2c4844'

describe('the band colours', () => {
  it('runs red, orange, yellow, newest first', () => {
    expect(FIRE_ACTIVITY_FILLS).toEqual(['#ff5a45', '#fb923c', '#fde047'])
  })

  it('clears 3:1 on both grounds, each disc in its stroke', () => {
    expect(contrast(FIRE_ACTIVITY_STROKE, LIBERTY_LAND)).toBeGreaterThanOrEqual(3)
    expect(contrast(FIRE_ACTIVITY_STROKE, LIBERTY_LAND)).toBeCloseTo(14.83, 2)
    const onForest = FIRE_ACTIVITY_FILLS.map((fill) => contrast(fill, DARK_FOREST))
    const onStroke = FIRE_ACTIVITY_FILLS.map((fill) => contrast(fill, FIRE_ACTIVITY_STROKE))
    for (const ratio of [...onForest, ...onStroke]) expect(ratio).toBeGreaterThanOrEqual(3)
    expect(onForest.map((r) => Number(r.toFixed(2)))).toEqual([3.21, 4.38, 7.52])
    expect(onStroke.map((r) => Number(r.toFixed(2)))).toEqual([5.66, 7.73, 13.27])
  })

  // The stroke cannot carry a disc on the forest, which is why the fill must.
  it('needs the fill on the forest, because the stroke does not clear it there', () => {
    expect(contrast(FIRE_ACTIVITY_STROKE, DARK_FOREST)).toBeLessThan(3)
  })

  // Older is lighter, so the ramp still reads to an eye that cannot tell the
  // hues apart.
  it('lightens as a detection ages', () => {
    const toStroke = FIRE_ACTIVITY_FILLS.map((fill) => contrast(fill, FIRE_ACTIVITY_STROKE))
    expect([...toStroke].sort((a, b) => a - b)).toEqual(toStroke)
  })
})

describe('fireActivityLegendChips', () => {
  it('keys each band with the hour it ends at, in its fill and the layer edge', () => {
    expect(fireActivityLegendChips()).toEqual([
      { label: '12h', fill: '#ff5a45', stroke: FIRE_ACTIVITY_STROKE },
      { label: '24h', fill: '#fb923c', stroke: FIRE_ACTIVITY_STROKE },
      { label: '48h', fill: '#fde047', stroke: FIRE_ACTIVITY_STROKE },
    ])
    expect(AGE_BAND_CHIPS).toHaveLength(AGE_BANDS.length)
    expect(AGE_BAND_CHIPS.map((chip) => Number.parseInt(chip, 10))).toEqual([...AGE_BANDS])
  })
})

// The one shape the map's icon and the legend's chip both draw.
describe('starburst', () => {
  it('alternates twelve points and twelve inner corners, from the top, clockwise', () => {
    const corners = starburst(10, 5, 5)
    expect(corners).toHaveLength(STARBURST_POINTS * 2)
    const radius = ([x, y]: [number, number]) => Math.hypot(x - 5, y - 5)
    corners.forEach((corner, i) => expect(radius(corner)).toBeCloseTo(i % 2 === 0 ? 10 : 10 * STARBURST_INNER, 9))
    expect(corners[0][0]).toBeCloseTo(5, 9)
    expect(corners[0][1]).toBeCloseTo(-5, 9)
    // A quarter turn on is three points along, on the right.
    expect(corners[6][0]).toBeCloseTo(15, 9)
    expect(corners[6][1]).toBeCloseTo(5, 9)
  })
})
