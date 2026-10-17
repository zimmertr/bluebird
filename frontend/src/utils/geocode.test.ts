import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  NOT_A_PLACE,
  distanceKm,
  isPlaceRow,
  parseCoordinates,
  boundsAround,
  boundsForPoints,
  placeFromNominatimRow,
  isPeakKind,
  rankPlaces,
  searchPlaces,
  viewboxParam,
} from './geocode'
import { fakeResponse } from '../testSupport/fixtures'

describe('parseCoordinates', () => {
  it('parses "lat, lon"', () => {
    expect(parseCoordinates('36.57862, -118.29107')).toEqual({ lat: 36.57862, lon: -118.29107 })
  })

  it('parses a parenthesized pair', () => {
    expect(parseCoordinates('(36.57862, -118.29107)')).toEqual({ lat: 36.57862, lon: -118.29107 })
  })

  it('parses a space-separated pair', () => {
    expect(parseCoordinates('36.57862 -118.29107')).toEqual({ lat: 36.57862, lon: -118.29107 })
  })

  it('parses a comma with no space', () => {
    expect(parseCoordinates('36.57862,-118.29107')).toEqual({ lat: 36.57862, lon: -118.29107 })
  })

  it('parses integer coordinates', () => {
    expect(parseCoordinates('47, -120')).toEqual({ lat: 47, lon: -120 })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseCoordinates('  36.5, -118.2  ')).toEqual({ lat: 36.5, lon: -118.2 })
  })

  it('rejects place names', () => {
    expect(parseCoordinates('Mt Whitney')).toBeNull()
    expect(parseCoordinates('Mt Whitney, ca')).toBeNull()
  })

  it('rejects out-of-range latitude', () => {
    expect(parseCoordinates('91, 0')).toBeNull()
    expect(parseCoordinates('-90.1, 0')).toBeNull()
  })

  it('rejects out-of-range longitude', () => {
    expect(parseCoordinates('0, 181')).toBeNull()
    expect(parseCoordinates('0, -180.5')).toBeNull()
  })

  it('rejects a lone number and empty input', () => {
    expect(parseCoordinates('36.5')).toBeNull()
    expect(parseCoordinates('')).toBeNull()
  })
})

describe('boundsAround', () => {
  it('spans the requested diameter, centered, at the equator', () => {
    const [[w, s], [e, n]] = boundsAround({ lat: 0, lon: 0 }, 10)
    expect(n - s).toBeCloseTo(10 / 69.05, 5)
    expect(e - w).toBeCloseTo(10 / 69.17, 5)
    expect((w + e) / 2).toBeCloseTo(0, 8)
    expect((s + n) / 2).toBeCloseTo(0, 8)
  })

  it('widens the longitude span at high latitude', () => {
    const [[w], [e]] = boundsAround({ lat: 60, lon: 10 }, 10)
    // cos(60°) = 0.5 → the box must be ~2× wider in degrees than at the equator
    expect(e - w).toBeCloseTo(10 / 69.17 / 0.5, 5)
  })

  it('grows to a feature bbox larger than the minimum view', () => {
    const bounds = boundsAround({ lat: 0, lon: 0, bbox: [-1, -2, 1, 2] }, 10)
    expect(bounds).toEqual([
      [-1, -2],
      [1, 2],
    ])
  })

  it('ignores a bbox smaller than the minimum view', () => {
    const [[, s], [, n]] = boundsAround(
      { lat: 0, lon: 0, bbox: [-0.001, -0.001, 0.001, 0.001] },
      10,
    )
    expect(n - s).toBeCloseTo(10 / 69.05, 5)
  })
})

describe('boundsForPoints', () => {
  it('returns null for an empty list', () => {
    expect(boundsForPoints([], 10)).toBeNull()
  })

  it('spans the minimum diameter, centered, for a single point', () => {
    const [[w, s], [e, n]] = boundsForPoints([{ latitude: 0, longitude: 0 }], 10)!
    expect(n - s).toBeCloseTo(10 / 69.05, 5)
    expect(e - w).toBeCloseTo(10 / 69.17, 5)
    expect((w + e) / 2).toBeCloseTo(0, 8)
    expect((s + n) / 2).toBeCloseTo(0, 8)
  })

  it('envelopes spread points exactly, with no extra padding', () => {
    const bounds = boundsForPoints(
      [
        { latitude: 45, longitude: -122 },
        { latitude: 48, longitude: -120 },
        { latitude: 46, longitude: -121 },
      ],
      10,
    )
    expect(bounds).toEqual([
      [-122, 45],
      [-120, 48],
    ])
  })

  it('expands a tight cluster to the minimum diameter, keeping its center', () => {
    const [[w, s], [e, n]] = boundsForPoints(
      [
        { latitude: 46.85, longitude: -121.76 },
        { latitude: 46.852, longitude: -121.758 },
      ],
      10,
    )!
    expect(n - s).toBeCloseTo(10 / 69.05, 5)
    expect((s + n) / 2).toBeCloseTo(46.851, 6)
    expect((w + e) / 2).toBeCloseTo(-121.759, 6)
    // cos(46.85°) scaling → wider in degrees than the same box at the equator
    expect(e - w).toBeGreaterThan(10 / 69.17)
  })

  it('widens the longitude span at high latitude', () => {
    const [[w], [e]] = boundsForPoints([{ latitude: 60, longitude: 10 }], 10)!
    // cos(60°) = 0.5 → the box must be ~2× wider in degrees than at the equator
    expect(e - w).toBeCloseTo(10 / 69.17 / 0.5, 5)
  })

  it('pads only the axis below the minimum', () => {
    // A 3°-long east-west line at the equator: longitude already exceeds the
    // floor and must stay exact; degenerate latitude must grow to it.
    const [[w, s], [e, n]] = boundsForPoints(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 3 },
      ],
      10,
    )!
    expect(w).toBe(0)
    expect(e).toBe(3)
    expect(n - s).toBeCloseTo(10 / 69.05, 5)
  })
})

describe('placeFromNominatimRow', () => {
  const row = {
    name: 'Mount Whitney',
    display_name: 'Mount Whitney, Inyo County, California, United States',
    type: 'peak',
    lat: '36.5785091',
    lon: '-118.2922585',
    boundingbox: ['36.4185091', '36.7385091', '-118.4522585', '-118.1322585'] as [
      string,
      string,
      string,
      string,
    ],
  }

  it('reorders the bbox from [S,N,W,E] to [W,S,E,N]', () => {
    expect(placeFromNominatimRow(row).bbox).toEqual([
      -118.4522585, 36.4185091, -118.1322585, 36.7385091,
    ])
  })

  it('parses coordinates and keeps the short name', () => {
    const place = placeFromNominatimRow(row)
    expect(place.label).toBe('Mount Whitney')
    expect(place.lat).toBeCloseTo(36.5785091)
    expect(place.lon).toBeCloseTo(-118.2922585)
    expect(place.kind).toBe('peak')
  })

  it('falls back to the first display_name segment when name is missing', () => {
    const place = placeFromNominatimRow({ ...row, name: undefined })
    expect(place.label).toBe('Mount Whitney')
  })

  it('humanizes underscored OSM types', () => {
    expect(placeFromNominatimRow({ ...row, type: 'nature_reserve' }).kind).toBe('nature reserve')
  })

  it('converts the extratags ele tag from meters to feet', () => {
    const place = placeFromNominatimRow({ ...row, extratags: { ele: '4421' } })
    expect(place.elevationFt).toBe(14505) // matches osm/query.py: round(m × 3.28084)
  })

  it('leaves elevation unset without extratags or with a non-numeric ele', () => {
    expect(placeFromNominatimRow(row).elevationFt).toBeUndefined()
    expect(placeFromNominatimRow({ ...row, extratags: null }).elevationFt).toBeUndefined()
    expect(
      placeFromNominatimRow({ ...row, extratags: { ele: '4421 m' } }).elevationFt,
    ).toBeUndefined()
  })

  it('builds osmId in the backend osm_id format', () => {
    const place = placeFromNominatimRow({ ...row, osm_type: 'node', osm_id: 944865772 })
    expect(place.osmId).toBe('node/944865772')
  })

  it('leaves osmId unset when the Nominatim row has no OSM ref', () => {
    expect(placeFromNominatimRow(row).osmId).toBeUndefined()
    expect(placeFromNominatimRow({ ...row, osm_type: 'node' }).osmId).toBeUndefined()
  })
})

describe('isPeakKind', () => {
  it('treats peaks and volcanos as peaks, everything else not', () => {
    expect(isPeakKind('peak')).toBe(true)
    expect(isPeakKind('volcano')).toBe(true)
    expect(isPeakKind('city')).toBe(false)
    expect(isPeakKind('lake')).toBe(false)
    expect(isPeakKind('coordinates')).toBe(false) // SearchBox's local parse
    expect(isPeakKind('')).toBe(false)
  })
})

// The Type column made this visible: Nominatim types a town as the OSM tag on
// its boundary relation, so Issaquah arrived as "Administrative".
describe('what a searched place is called', () => {
  const row = (over: Record<string, unknown>) =>
    placeFromNominatimRow({
      name: 'X',
      display_name: 'X, Somewhere',
      lat: '47.5',
      lon: '-122.0',
      ...over,
    } as Parameters<typeof placeFromNominatimRow>[0])

  it('prefers the place kind over the bureaucratic one', () => {
    expect(row({ type: 'administrative', addresstype: 'city' }).kind).toBe('city')
    expect(row({ type: 'boundary', addresstype: 'town' }).kind).toBe('town')
  })

  // OSM's bare `yes` (as in `building=yes`) names no kind, so the place
  // kind stands in for it the way it does for a boundary.
  it('prefers the place kind over a bare yes', () => {
    expect(row({ type: 'yes', addresstype: 'building' }).kind).toBe('building')
  })

  it('leaves a real feature type alone', () => {
    expect(row({ type: 'peak', addresstype: 'peak' }).kind).toBe('peak')
    expect(row({ type: 'water', addresstype: 'water' }).kind).toBe('water')
  })

  it('keeps the raw type when there is nothing better to fall back to', () => {
    expect(row({ type: 'administrative' }).kind).toBe('administrative')
  })

  it('still humanizes underscores', () => {
    expect(row({ type: 'nature_reserve' }).kind).toBe('nature reserve')
  })
})

// The view a search is sent from (#711). Measured 2026-10-16 from the app's
// opening view: the box changes which places Nominatim answers, and inside
// the box its order is a flat importance score, so the browser orders by
// distance from the map's centre and drops the rows that are not places.
const OPENING = { west: -128.4, south: 44.2, east: -112.6, north: 50.8, lat: 47.5, lon: -120.5 }

describe('viewboxParam', () => {
  it('rounds the view outward to whole degrees, west,south,east,north', () => {
    expect(viewboxParam(OPENING)).toBe('-129,44,-112,51')
  })

  it('leaves a view already on whole degrees alone', () => {
    expect(viewboxParam({ west: -123, south: 46, east: -120, north: 49 })).toBe('-123,46,-120,49')
  })

  it('clamps a view wider than the globe to the globe', () => {
    expect(viewboxParam({ west: -400, south: -95, east: 400, north: 95 })).toBe('-180,-90,180,90')
  })

  // MapLibre does not wrap longitude: a view reached by dragging west across
  // the Pacific reports a west past -180, and one dragged east a west past
  // 180. Sent as read, the pod refused the box and every search failed.
  it('brings a view dragged across the antimeridian back inside the globe', () => {
    // Japan, reached by dragging west: about -230 to -210.
    expect(viewboxParam({ west: -230, south: 30, east: -210.2, north: 40 })).toBe('130,30,150,40')
    // The same ground reached by dragging east.
    expect(viewboxParam({ west: 490, south: 30, east: 509.8, north: 40 })).toBe('130,30,150,40')
  })

  it('answers the globe in longitude for a view that straddles the antimeridian', () => {
    expect(viewboxParam({ west: 170, south: 50, east: 190, north: 60 })).toBe('-180,50,180,60')
    expect(viewboxParam({ west: -190, south: 50, east: -170, north: 60 })).toBe('-180,50,180,60')
  })
})

describe('distanceKm', () => {
  it('is zero to itself and great-circle across a continent', () => {
    expect(distanceKm(OPENING, OPENING)).toBe(0)
    // Wenatchee to Springfield, Illinois, as the audit summed it.
    expect(Math.round(distanceKm(OPENING, { lat: 39.8, lon: -89.65 }))).toBe(2605)
  })
})

describe('rankPlaces', () => {
  const nominatim = (over: Record<string, unknown>) => ({
    name: 'Blue Lake',
    display_name: 'Blue Lake, Somewhere',
    category: 'natural',
    type: 'water',
    lat: '0',
    lon: '0',
    ...over,
  })
  const california = nominatim({ display_name: 'Blue Lake, Humboldt County, California', lat: '40.88', lon: '-123.98' })
  const okanogan = nominatim({ display_name: 'Blue Lake, Okanogan County, Washington', lat: '48.6', lon: '-119.6' })
  const skamania = nominatim({ display_name: 'Blue Lake, Skamania County, Washington', lat: '46.1', lon: '-121.9' })

  it('puts the nearest first whatever order the geocoder sent', () => {
    const ranked = rankPlaces([california, skamania, okanogan], OPENING)
    expect(ranked.map((p) => p.description)).toEqual([okanogan.display_name, skamania.display_name, california.display_name])
  })

  it('drops a street and a zoning area, which name no place a reader can stand at', () => {
    expect(NOT_A_PLACE).toEqual(new Set(['highway', 'landuse']))
    const street = nominatim({ display_name: 'Blue Lake Road', category: 'highway', type: 'residential', lat: '47.5', lon: '-120.5' })
    const subdivision = nominatim({ display_name: 'Blue Lake, a subdivision', category: 'landuse', type: 'residential', lat: '47.5', lon: '-120.5' })
    const ranked = rankPlaces([street, subdivision, okanogan], OPENING)
    expect(ranked.map((p) => p.description)).toEqual([okanogan.display_name])
  })

  it('keeps a row with no category, which an older format or a stub may send', () => {
    const bare = nominatim({ category: undefined })
    expect(rankPlaces([bare], OPENING)).toHaveLength(1)
  })

  it('drops a row whose coordinates do not parse, which would scramble the sort', () => {
    const broken = nominatim({ lat: 'north', lon: '-120' })
    expect(isPlaceRow(broken)).toBe(false)
    expect(rankPlaces([broken, okanogan, california], OPENING).map((p) => p.description)).toEqual([
      okanogan.display_name,
      california.display_name,
    ])
  })

  it('answers an empty list for an empty answer', () => {
    expect(rankPlaces([], OPENING)).toEqual([])
  })
})

describe('searchPlaces', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = (rows: unknown[]) => {
    const spy = vi.fn(() => Promise.resolve(fakeResponse(rows)))
    vi.stubGlobal('fetch', spy)
    return spy
  }
  const url = (spy: ReturnType<typeof vi.fn>) => String(spy.mock.calls[0][0])

  it('sends the rounded view box and ranks the answer from its centre', async () => {
    const far = { name: 'Blue Lake', display_name: 'Blue Lake, California', category: 'natural', type: 'water', lat: '40.88', lon: '-123.98' }
    const near = { name: 'Blue Lake', display_name: 'Blue Lake, Washington', category: 'natural', type: 'water', lat: '48.6', lon: '-119.6' }
    const spy = stub([far, near])
    const places = await searchPlaces('Blue Lake', undefined, 10, OPENING)
    expect(url(spy)).toBe('/api/geocode?limit=10&q=Blue%20Lake&viewbox=-129,44,-112,51')
    expect(places.map((p) => p.description)).toEqual([near.display_name, far.display_name])
  })

  it('sends no box and keeps the geocoder order without a view, non-places still dropped', async () => {
    const far = { name: 'Blue Lake', display_name: 'Blue Lake, California', category: 'natural', type: 'water', lat: '40.88', lon: '-123.98' }
    const street = { name: 'Blue Lake', display_name: 'Blue Lake Road', category: 'highway', type: 'residential', lat: '47.5', lon: '-120.5' }
    const near = { name: 'Blue Lake', display_name: 'Blue Lake, Washington', category: 'natural', type: 'water', lat: '48.6', lon: '-119.6' }
    const spy = stub([far, street, near])
    const places = await searchPlaces('Blue Lake', undefined, 10, null)
    expect(url(spy)).toBe('/api/geocode?limit=10&q=Blue%20Lake')
    expect(places.map((p) => p.description)).toEqual([far.display_name, near.display_name])
  })
})
