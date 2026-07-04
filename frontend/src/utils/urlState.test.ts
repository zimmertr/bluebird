import { describe, it, expect } from 'vitest'
import {
  encodeState,
  decodeState,
  classifyWindow,
  ShareableState,
  PAST_LIMIT_DAYS,
  FUTURE_LIMIT_DAYS,
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

describe('encodeState', () => {
  it('returns "" when there is nothing worth sharing', () => {
    expect(encodeState({ ...base, polygon: null })).toBe('')
  })

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

  it('is future when the window starts beyond the forecast horizon', () => {
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 2), shift(FUTURE_LIMIT_DAYS + 5), now)).toBe(
      'future',
    )
  })

  it('is ok when only part of the window is servable', () => {
    // Starts within the forecast horizon, ends beyond it → still partly servable.
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS - 1), shift(FUTURE_LIMIT_DAYS + 5), now)).toBe(
      'ok',
    )
  })

  it('is ok when the window is incomplete', () => {
    expect(classifyWindow('', '', now)).toBe('ok')
  })
})
