import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Feature, Point } from 'geojson'
import type { FireActivityResponse, FireDetectionProps } from '../types'
import { contrast } from '../testSupport/contrast'
import { fakeResponse } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'
import {
  AGE_BANDS,
  AGE_BAND_CHIPS,
  AGE_BAND_WORDS,
  FIRE_ACTIVITY_FILLS,
  FIRE_ACTIVITY_STROKE,
  FIRE_ACTIVITY_ICON_SIZE,
  FIRE_ACTIVITY_MINZOOM,
  FIRE_STAR_PIXEL_RATIO,
  FIRE_STAR_PX,
  STARBURST_INNER,
  STARBURST_POINTS,
  starburstSdf,
  ageBand,
  fetchFireActivity,
  fireActivityLegendChips,
  starburst,
  fireActivityQueryUrl,
  hotspotPopupHtml,
  hotspotRows,
  withAgeBands,
} from './fireActivity'
import { monthDayTime } from './popup/popupChrome'

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
      { label: '12', words: 'Under 12 hours', fill: '#ff5a45', stroke: FIRE_ACTIVITY_STROKE },
      { label: '24', words: '12 to 24 hours', fill: '#fb923c', stroke: FIRE_ACTIVITY_STROKE },
      { label: '48', words: '24 to 48 hours', fill: '#fde047', stroke: FIRE_ACTIVITY_STROKE },
    ])
    expect(AGE_BAND_CHIPS).toHaveLength(AGE_BANDS.length)
    expect(AGE_BAND_WORDS).toHaveLength(AGE_BANDS.length)
    expect(AGE_BAND_CHIPS.map((chip) => Number.parseInt(chip, 10))).toEqual([...AGE_BANDS])
  })
})

// The one shape the map's icon and the legend's chip both draw.
describe('starburst', () => {
  it('alternates twelve points and twelve inner corners, from the top, clockwise', () => {
    expect(STARBURST_INNER).toEqual({ map: 0.65, chip: 0.8 })
    const corners = starburst(10, 0.65, 5, 5)
    expect(corners).toHaveLength(STARBURST_POINTS * 2)
    const radius = ([x, y]: [number, number]) => Math.hypot(x - 5, y - 5)
    corners.forEach((corner, i) => expect(radius(corner)).toBeCloseTo(i % 2 === 0 ? 10 : 6.5, 9))
    expect(corners[0][0]).toBeCloseTo(5, 9)
    expect(corners[0][1]).toBeCloseTo(-5, 9)
    // A quarter turn on is three points along, on the right.
    expect(corners[6][0]).toBeCloseTo(15, 9)
    expect(corners[6][1]).toBeCloseTo(5, 9)
  })
})

// The map's icon (#799): the starburst as MapLibre's SDF reads it, an edge at
// 192 of 255 and 16 steps a pixel at twice the density, so a 14 px star at
// zoom 12 and a 6 px one at the floor come from one image.
describe('starburstSdf', () => {
  const image = starburstSdf()
  const alpha = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]

  it('draws the star at 14 px across, at twice the density, with room for its halo', () => {
    expect(FIRE_STAR_PX).toBe(14)
    expect(FIRE_STAR_PIXEL_RATIO).toBe(2)
    expect([image.width, image.height]).toEqual([44, 44])
    expect(image.data).toHaveLength(44 * 44 * 4)
    expect(FIRE_ACTIVITY_ICON_SIZE).toEqual(['interpolate', ['linear'], ['zoom'], FIRE_ACTIVITY_MINZOOM, 6 / 14, 12, 1])
  })

  it('reads full inside, at the edge on a point and between two, and empty at the corners', () => {
    expect(alpha(22, 22)).toBe(255)
    // The top point's tip, 14 px above the centre, stands on the edge.
    expect(Math.abs(alpha(21, 8) - 192)).toBeLessThanOrEqual(16)
    // Between the top point and the next, the inner corner is 9.1 px out, so
    // a pixel 11 px out there is outside and one 8 px out is inside.
    const at = (r: number, deg: number) =>
      alpha(Math.floor(22 + r * Math.sin((deg * Math.PI) / 180)), Math.floor(22 - r * Math.cos((deg * Math.PI) / 180)))
    expect(at(11, 15)).toBeLessThan(192)
    expect(at(8, 15)).toBeGreaterThan(192)
    for (const [x, y] of [[0, 0], [43, 0], [0, 43], [43, 43]]) expect(alpha(x, y)).toBeLessThan(64)
  })

  // The legend's 16px chip, points at 7.5px, holds its label inside its
  // inner corners: their apothem against half the widest label measured,
  // 11.1px (2026-10-29). The map's depth would not hold it.
  it('leaves the chip room for its label inside the inner corners', () => {
    const apothem = 7.5 * STARBURST_INNER.chip * Math.cos(Math.PI / STARBURST_POINTS)
    expect(apothem).toBeGreaterThan(11.1 / 2)
    expect(7.5 * STARBURST_INNER.map * Math.cos(Math.PI / STARBURST_POINTS)).toBeLessThan(11.1 / 2)
  })

  // The same star turned a quarter is the same star: twelve points.
  it('is the same a quarter turn on', () => {
    for (let y = 0; y < 44; y++) {
      for (let x = 0; x < 44; x++) expect(Math.abs(alpha(x, y) - alpha(43 - y, x))).toBeLessThanOrEqual(1)
    }
  })
})

// The card a click on a star opens (the maintainer, 2026-10-29): `Hotspot`
// over four lines whose labels are the approved copy and whose values are the
// feed's, a line left off where the feed has nothing to say.
describe('hotspotRows', () => {
  const seen = NOW - 3 * HOUR - 20 * 60 * 1000
  const viirs = {
    acquired: new Date(seen).toISOString(),
    instrument: 'VIIRS',
    satellite: 'N20',
    confidence: 'nominal',
    frp: 4.26,
  }
  const rows = (properties: Record<string, unknown>, now = NOW) =>
    Object.fromEntries(hotspotRows({ properties }, now).map((r) => [r.label, r.value]))

  it('reads a VIIRS detection in the card’s four lines, in order', () => {
    expect(hotspotRows({ properties: viirs }, NOW)).toEqual([
      { label: 'Detected', value: `${monthDayTime(new Date(seen))} (3h ago)` },
      { label: 'Satellite', value: 'NOAA-20 VIIRS' },
      { label: 'Confidence', value: 'Nominal' },
      { label: 'Fire power', value: '4.3 MW' },
    ])
  })

  it('dates the pass in the month, the day and the time, with no year', () => {
    // America/Los_Angeles, the zone the suite runs in.
    expect(rows({ acquired: '2026-10-29T17:12:00Z' }, Date.parse('2026-10-29T20:12:00Z')).Detected).toMatch(
      /^Oct 29, 10:12\s?AM \(3h ago\)$/,
    )
  })

  it('names every satellite FIRMS’s three files carry', () => {
    expect(rows({ satellite: 'N20', instrument: 'VIIRS' }).Satellite).toBe('NOAA-20 VIIRS')
    expect(rows({ satellite: 'N21', instrument: 'VIIRS' }).Satellite).toBe('NOAA-21 VIIRS')
    expect(rows({ satellite: 'T', instrument: 'MODIS' }).Satellite).toBe('Terra MODIS')
    expect(rows({ satellite: 'A', instrument: 'MODIS' }).Satellite).toBe('Aqua MODIS')
    expect(rows({ satellite: 'Terra', instrument: 'MODIS' }).Satellite).toBe('Terra MODIS')
    expect(rows({ satellite: 'Aqua', instrument: 'MODIS' }).Satellite).toBe('Aqua MODIS')
    // A code the table does not know names the instrument rather than a letter.
    expect(rows({ satellite: 'N', instrument: 'VIIRS' }).Satellite).toBe('VIIRS')
    expect(rows({ satellite: 'N21' }).Satellite).toBe('NOAA-21')
  })

  it('spells VIIRS’s confidence in sentence case and MODIS’s as a percent', () => {
    expect(rows({ confidence: 'low' }).Confidence).toBe('Low')
    expect(rows({ confidence: 'nominal' }).Confidence).toBe('Nominal')
    expect(rows({ confidence: 'high' }).Confidence).toBe('High')
    expect(rows({ confidence: 'h' }).Confidence).toBe('High')
    expect(rows({ confidence: '66' }).Confidence).toBe('66%')
    expect(rows({ confidence: '0' }).Confidence).toBe('0%')
    expect(rows({ confidence: '100' }).Confidence).toBe('100%')
    expect(rows({ confidence: 66 }).Confidence).toBe('66%')
  })

  it('gives the fire power a decimal under 10 megawatts and none from 10', () => {
    expect(rows({ frp: 0.71 })['Fire power']).toBe('0.7 MW')
    expect(rows({ frp: 9.94 })['Fire power']).toBe('9.9 MW')
    expect(rows({ frp: 9.96 })['Fire power']).toBe('10 MW')
    expect(rows({ frp: 22.85 })['Fire power']).toBe('23 MW')
    expect(rows({ frp: 1234.5 })['Fire power']).toBe(`${(1235).toLocaleString()} MW`)
  })

  it('says how long ago in seconds, minutes, hours, then days to a tenth', () => {
    const ago = (ms: number) => rows({ acquired: new Date(NOW - ms).toISOString() }).Detected.replace(/^.*\((.*)\)$/, '$1')
    expect(ago(0)).toBe('0s ago')
    expect(ago(20 * 1000)).toBe('20s ago')
    expect(ago(59 * 1000)).toBe('59s ago')
    // A stamp ahead of the reader's clock is not called the future.
    expect(ago(-5 * 60 * 1000)).toBe('0s ago')
    expect(ago(60 * 1000)).toBe('1m ago')
    expect(ago(42 * 60 * 1000)).toBe('42m ago')
    expect(ago(HOUR - 1000)).toBe('59m ago')
    expect(ago(HOUR)).toBe('1h ago')
    expect(ago(HOUR + 59 * 60 * 1000)).toBe('1h ago')
    expect(ago(23 * HOUR + 59 * 60 * 1000)).toBe('23h ago')
    expect(ago(24 * HOUR)).toBe('1.0d ago')
    // Rounded down, so 28.8 hours is 1.2 days, a minute less is 1.1, and
    // 47.9 hours is 1.9, never 2.0.
    expect(ago(28 * HOUR + 48 * 60 * 1000)).toBe('1.2d ago')
    expect(ago(28 * HOUR + 47 * 60 * 1000)).toBe('1.1d ago')
    expect(ago(47 * HOUR + 54 * 60 * 1000)).toBe('1.9d ago')
    expect(ago(48 * HOUR)).toBe('2.0d ago')
  })

  it('reads the line the maintainer wrote', () => {
    // America/Los_Angeles: 23:18 UTC on Oct 28 is 4:18 PM there.
    expect(rows({ acquired: '2026-10-28T23:18:00Z' }, Date.parse('2026-10-29T19:18:00Z')).Detected).toMatch(
      /^Oct 28, 4:18\s?PM \(20h ago\)$/,
    )
  })

  it('leaves off a line the feed has nothing for, rather than a dash', () => {
    expect(hotspotRows({ properties: {} }, NOW)).toEqual([])
    expect(hotspotRows({ properties: null }, NOW)).toEqual([])
    const sparse = { acquired: 'not a time', instrument: '', satellite: '', confidence: ' ', frp: null }
    expect(hotspotRows({ properties: sparse }, NOW)).toEqual([])
    expect(rows({ ...viirs, frp: undefined })).not.toHaveProperty('Fire power')
    expect(rows({ ...viirs, frp: Number.NaN })).not.toHaveProperty('Fire power')
    expect(Object.keys(rows({ ...viirs, confidence: '' }))).toEqual(['Detected', 'Satellite', 'Fire power'])
  })

  it('draws the card titled Hotspot with each line’s label and value', () => {
    const html = hotspotPopupHtml({ properties: viirs }, NOW)
    expect(html).toMatch(/<strong[^>]*>Hotspot<\/strong>/)
    const body = html.slice(html.indexOf('data-popup-body'))
    expect(markupText(body.slice(body.indexOf('>') + 1)).trim()).toBe(
      `Detected: ${monthDayTime(new Date(seen))} (3h ago)` +
        'Satellite: NOAA-20 VIIRS' +
        'Confidence: Nominal' +
        'Fire power: 4.3 MW',
    )
  })
})
