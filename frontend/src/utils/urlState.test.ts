import { describe, it, expect } from 'vitest'
import {
  encodeState,
  decodeState,
  classifyWindow,
  classifyAqiCoverage,
  ShareableState,
  PAST_LIMIT_DAYS,
  FUTURE_LIMIT_DAYS,
  AQI_LIMIT_DAYS,
} from './urlState'
import { GeoPolygon } from '../types'

const polygon: GeoPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-121.76041, 46.85289],
      [-121.49094, 46.20241],
      [-121.11391, 48.11223],
      [-121.76041, 46.85289], // closing vertex
    ],
  ],
}

const base: ShareableState = {
  polygon,
  destinationType: 'peak',
  startDatetime: '2026-07-04T06:00',
  endDatetime: '2026-07-07T18:00',
  sortBy: 'precip_total_in',
  minElevationFt: null,
  maxElevationFt: null,
  limit: 10,
  customCsv: '',
}

// A truly untouched session: no polygon, no custom CSV, End unset, all controls
// at their App defaults. Start is pre-filled but must not, on its own, sync.
const pristine: ShareableState = {
  polygon: null,
  destinationType: 'peak',
  startDatetime: '2026-07-04T06:00',
  endDatetime: '',
  sortBy: 'precip_total_in',
  minElevationFt: null,
  maxElevationFt: null,
  limit: 10,
  customCsv: '',
}

// Round-trip helper: encode, then decode the resulting query string.
function roundTrip(state: ShareableState) {
  return decodeState(encodeState(state))
}

describe('encodeState / decodeState round-trip', () => {
  it('restores a peak analysis with a polygon', () => {
    const out = roundTrip(base)
    expect(out).not.toBeNull()
    expect(out!.destinationType).toBe('peak')
    expect(out!.startDatetime).toBe('2026-07-04T06:00')
    expect(out!.endDatetime).toBe('2026-07-07T18:00')
    expect(out!.sortBy).toBe('precip_total_in')
    expect(out!.limit).toBe(10)
    // Polygon ring is rebuilt closed with the same vertices.
    const ring = out!.polygon!.coordinates[0]
    expect(ring).toHaveLength(4)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('restores elevation constraints and a non-default sort', () => {
    const out = roundTrip({
      ...base,
      minElevationFt: 8000,
      maxElevationFt: 12000,
      sortBy: 'wind_max_mph',
      limit: 25,
    })
    expect(out!.minElevationFt).toBe(8000)
    expect(out!.maxElevationFt).toBe(12000)
    expect(out!.sortBy).toBe('wind_max_mph')
    expect(out!.limit).toBe(25)
  })

  it('restores the AQI sort options', () => {
    expect(roundTrip({ ...base, sortBy: 'aqi_avg' })!.sortBy).toBe('aqi_avg')
    expect(roundTrip({ ...base, sortBy: 'aqi_max' })!.sortBy).toBe('aqi_max')
  })

  it('restores a custom-CSV analysis without a polygon', () => {
    const csv = '46.8529,-121.7604\n46.2024,-121.4909'
    const out = roundTrip({
      ...base,
      polygon: null,
      destinationType: 'custom',
      customCsv: csv,
    })
    expect(out!.destinationType).toBe('custom')
    expect(out!.customCsv).toBe(csv)
    expect(out!.polygon).toBeUndefined()
  })
})

describe('encodeState gate — what triggers a URL update', () => {
  it('returns "" for a pristine session (nothing the user set)', () => {
    expect(encodeState(pristine)).toBe('')
  })

  it('does not sync when only the pre-filled Start date is present', () => {
    expect(encodeState({ ...pristine, startDatetime: '2030-01-01T00:00' })).toBe('')
  })

  it('syncs when only the End date is set, with no polygon', () => {
    const qs = encodeState({ ...pristine, endDatetime: '2026-07-07T18:00' })
    expect(qs).not.toBe('')
    expect(new URLSearchParams(qs).get('end')).toBe('2026-07-07T18:00')
  })

  it('syncs when only an elevation constraint is set', () => {
    expect(encodeState({ ...pristine, minElevationFt: 8000 })).not.toBe('')
    expect(encodeState({ ...pristine, maxElevationFt: 12000 })).not.toBe('')
  })

  it('syncs when a non-default sort, limit, or type is chosen', () => {
    expect(encodeState({ ...pristine, sortBy: 'wind_max_mph' })).not.toBe('')
    expect(encodeState({ ...pristine, limit: 25 })).not.toBe('')
    expect(encodeState({ ...pristine, destinationType: 'custom' })).not.toBe('')
  })
})

describe('encodeState', () => {

  it('omits elevation params when unset', () => {
    const qs = encodeState(base)
    expect(qs).not.toContain('minel')
    expect(qs).not.toContain('maxel')
  })

  it('omits the custom param outside custom mode', () => {
    const qs = encodeState({ ...base, customCsv: 'ignored' })
    expect(qs).not.toContain('custom')
  })

  it('rounds polygon coordinates to ~5 decimals', () => {
    const qs = encodeState({
      ...base,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [-121.760419999, 46.852891234],
            [-121.49094, 46.20241],
            [-121.11391, 48.11223],
            [-121.760419999, 46.852891234],
          ],
        ],
      },
    })
    const poly = new URLSearchParams(qs).get('poly')!
    expect(poly.startsWith('-121.76042,46.85289')).toBe(true)
  })

  it('drops the closing vertex from the encoded polygon', () => {
    const poly = new URLSearchParams(encodeState(base)).get('poly')!
    // 3 unique vertices → 3 encoded pairs, not 4.
    expect(poly.split(';')).toHaveLength(3)
  })
})

describe('decodeState tolerance', () => {
  it('returns null for empty input', () => {
    expect(decodeState('')).toBeNull()
    expect(decodeState('?')).toBeNull()
  })

  it('never throws on garbage and returns null when nothing usable', () => {
    expect(() => decodeState('%%%not a=valid&&&')).not.toThrow()
    expect(decodeState('foo=bar&baz=qux')).toBeNull()
  })

  it('drops an invalid polygon but keeps valid fields', () => {
    const out = decodeState('type=peak&poly=notcoords')
    expect(out!.polygon).toBeUndefined()
    expect(out!.destinationType).toBe('peak')
  })

  it('drops a polygon with fewer than 3 vertices', () => {
    expect(decodeState('poly=-121.5,46.8;-121.4,46.2')).toBeNull()
  })

  it('rejects an unknown destination type and out-of-range limit', () => {
    const out = decodeState('type=volcano&limit=9999&sort=precip_total_in')
    expect(out!.destinationType).toBeUndefined()
    expect(out!.limit).toBeUndefined()
    expect(out!.sortBy).toBe('precip_total_in')
  })

  it('rejects a malformed datetime', () => {
    expect(decodeState('start=yesterday')).toBeNull()
  })
})

describe('classifyWindow', () => {
  const now = new Date('2026-07-04T12:00')
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const shift = (days: number) => iso(new Date(now.getTime() + days * 86_400_000))

  it('is ok for a near-future window', () => {
    expect(classifyWindow(shift(1), shift(4), now)).toBe('ok')
  })

  it('is ok for a recent-past window still within the history horizon', () => {
    expect(classifyWindow(shift(-10), shift(-8), now)).toBe('ok')
  })

  it('is past when the window ends before the history horizon', () => {
    expect(classifyWindow(shift(-(PAST_LIMIT_DAYS + 5)), shift(-(PAST_LIMIT_DAYS + 2)), now)).toBe(
      'past',
    )
  })

  it('is past when the window merely starts before the history horizon', () => {
    // Open-Meteo rejects out-of-range start dates, so a partial overhang fails too.
    expect(classifyWindow(shift(-(PAST_LIMIT_DAYS + 5)), shift(-10), now)).toBe('past')
  })

  it('is future when the window starts beyond the forecast horizon', () => {
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 2), shift(FUTURE_LIMIT_DAYS + 5), now)).toBe(
      'future',
    )
  })

  it('is future when the window merely ends beyond the forecast horizon', () => {
    // Starts within the horizon but ends past it — Open-Meteo would 400 the
    // request, so this must warn rather than pass as ok.
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS - 1), shift(FUTURE_LIMIT_DAYS + 5), now)).toBe(
      'future',
    )
  })

  it('is future for an absurdly long window (start now, end next year)', () => {
    expect(classifyWindow(shift(0), shift(365), now)).toBe('future')
  })

  it('is ok when the window is incomplete', () => {
    expect(classifyWindow('', '', now)).toBe('ok')
  })
})

describe('classifyAqiCoverage', () => {
  const now = new Date('2026-07-04T12:00')
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const shift = (days: number) => iso(new Date(now.getTime() + days * 86_400_000))

  it('is full when the window ends inside the AQI horizon', () => {
    expect(classifyAqiCoverage(shift(1), shift(AQI_LIMIT_DAYS - 1), now)).toBe('full')
  })

  it('is partial when only the start of the window is covered', () => {
    expect(classifyAqiCoverage(shift(2), shift(AQI_LIMIT_DAYS + 3), now)).toBe('partial')
  })

  it('is none when the window starts beyond the horizon', () => {
    expect(classifyAqiCoverage(shift(AQI_LIMIT_DAYS + 1), shift(AQI_LIMIT_DAYS + 3), now)).toBe(
      'none',
    )
  })

  it('is full for past windows (the AQI archive covers them)', () => {
    expect(classifyAqiCoverage(shift(-10), shift(-8), now)).toBe('full')
  })

  it('is full when the window is incomplete', () => {
    expect(classifyAqiCoverage('', '', now)).toBe('full')
  })
})
