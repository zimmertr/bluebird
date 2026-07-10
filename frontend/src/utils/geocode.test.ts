import { describe, it, expect } from 'vitest'
import { parseCoordinates, boundsAround, placeFromNominatimRow } from './geocode'

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
})
