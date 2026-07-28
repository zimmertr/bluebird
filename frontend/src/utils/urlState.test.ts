import { describe, it, expect } from 'vitest'
import {
  encodeState,
  decodeState,
  classifyWindow,
  classifyMoment,
  classifyAqiCoverage,
  resolveSearchWindow,
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
  mode: 'window',
  atDatetime: '',
  sortBy: 'precip_total_in',
  sortDesc: false,
  minElevationFt: null,
  maxElevationFt: null,
  limit: 10,
  customCsv: '',
  showWildfires: false,
  pins: [],
}

// A truly untouched session: no polygon, no custom CSV, all controls at their
// App defaults — including mode 'now'. The pre-filled window must not, on its
// own, sync to the URL.
const pristine: ShareableState = {
  polygon: null,
  destinationType: 'peak',
  startDatetime: '2026-07-04T06:00',
  endDatetime: '2026-07-04T06:00',
  mode: 'now',
  atDatetime: '',
  sortBy: 'precip_total_in',
  sortDesc: false,
  minElevationFt: null,
  maxElevationFt: null,
  limit: 100,
  customCsv: '',
  showWildfires: false,
  pins: [],
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
      sortBy: 'wind_avg_mph',
      limit: 25,
    })
    expect(out!.minElevationFt).toBe(8000)
    expect(out!.maxElevationFt).toBe(12000)
    expect(out!.sortBy).toBe('wind_avg_mph')
    expect(out!.limit).toBe(25)
  })

  it('restores every sortable metric', () => {
    expect(roundTrip({ ...base, sortBy: 'wind_avg_mph' })!.sortBy).toBe('wind_avg_mph')
    expect(roundTrip({ ...base, sortBy: 'temp_avg_f' })!.sortBy).toBe('temp_avg_f')
    expect(roundTrip({ ...base, sortBy: 'aqi_avg' })!.sortBy).toBe('aqi_avg')
  })

  it('round-trips the sort direction', () => {
    const out = roundTrip({ ...base, sortBy: 'temp_avg_f', sortDesc: true })
    expect(out!.sortBy).toBe('temp_avg_f')
    expect(out!.sortDesc).toBe(true)
    // Ascending is the default and stays out of the URL entirely.
    expect(encodeState(base)).not.toContain('desc')
    expect(roundTrip(base)!.sortDesc).toBeUndefined()
  })

  it('round-trips the wildfire overlay toggle', () => {
    const out = roundTrip({ ...base, showWildfires: true })
    expect(out!.showWildfires).toBe(true)
    // Off is the default and stays out of the URL entirely.
    expect(encodeState(base)).not.toContain('fires')
    expect(roundTrip(base)!.showWildfires).toBeUndefined()
  })

  it('restores a CSV-only analysis without a polygon', () => {
    const csv = '46.8529,-121.7604\n46.2024,-121.4909'
    const out = roundTrip({
      ...base,
      polygon: null,
      customCsv: csv,
    })
    expect(out!.customCsv).toBe(csv)
    expect(out!.polygon).toBeUndefined()
  })

  it('restores a CSV alongside a polygon — the union analysis', () => {
    const csv = '46.8529,-121.7604,Mount Rainier'
    const out = roundTrip({ ...base, customCsv: csv })
    expect(out!.customCsv).toBe(csv)
    expect(out!.destinationType).toBe('peak')
    expect(out!.polygon!.coordinates[0]).toHaveLength(4)
  })

  it('round-trips a large multi-line custom CSV through compression', () => {
    // Comments, commas inside names, unicode, and 100 rows — the fields that must
    // survive the compress → percent-encode → decode chain intact.
    const csv =
      '# The Bulger List — Washington peaks (commas, 14,406 ft, unicode —)\n' +
      Array.from(
        { length: 100 },
        (_, i) => `4${i % 9}.${i}00000, -12${i % 3}.${i}00000, ${i + 1}. Peak #${i + 1} (${i}00 ft)`,
      ).join('\n')
    const out = roundTrip({ ...base, polygon: null, customCsv: csv })
    expect(out!.customCsv).toBe(csv)
  })

  it('writes the CSV compressed under `customz`, well below its raw length', () => {
    const csv = Array.from({ length: 100 }, (_, i) => `47.${i}, -121.${i}, Peak ${i}`).join('\n')
    const qs = encodeState({ ...base, polygon: null, customCsv: csv })
    const params = new URLSearchParams(qs)
    expect(params.get('custom')).toBeNull() // legacy raw key is not written
    const customz = params.get('customz')!
    expect(customz).toBeTruthy()
    expect(customz.length).toBeLessThan(csv.length * 0.6)
  })
})

describe('encodeState gate — what triggers a URL update', () => {
  it('returns "" for a pristine session (nothing the user set)', () => {
    expect(encodeState(pristine)).toBe('')
  })

  it('does not sync when only the pre-filled Start date is present', () => {
    expect(encodeState({ ...pristine, startDatetime: '2030-01-01T00:00' })).toBe('')
  })

  it('does not sync for the pre-filled window alone — End is no longer a signal', () => {
    // Both dates default to "now", so a filled window says nothing about user
    // intent. It rides along once any other signal is present (see round-trips).
    expect(encodeState({ ...pristine, endDatetime: '2026-07-07T18:00' })).toBe('')
  })

  it('syncs when only an elevation constraint is set', () => {
    expect(encodeState({ ...pristine, minElevationFt: 8000 })).not.toBe('')
    expect(encodeState({ ...pristine, maxElevationFt: 12000 })).not.toBe('')
  })

  it('syncs when a non-default sort, direction, limit, or type is chosen', () => {
    expect(encodeState({ ...pristine, sortBy: 'wind_avg_mph' })).not.toBe('')
    expect(encodeState({ ...pristine, sortDesc: true })).not.toBe('')
    expect(encodeState({ ...pristine, limit: 25 })).not.toBe('')
    expect(encodeState({ ...pristine, destinationType: 'trailhead' })).not.toBe('')
  })

  it('syncs on a CSV alone — no polygon or mode required', () => {
    const qs = encodeState({ ...pristine, customCsv: '46.8529,-121.7604' })
    expect(qs).not.toBe('')
    expect(new URLSearchParams(qs).get('customz')).toBeTruthy()
  })

  it('syncs when the wildfire overlay is enabled', () => {
    expect(encodeState({ ...pristine, showWildfires: true })).not.toBe('')
    expect(new URLSearchParams(encodeState({ ...pristine, showWildfires: true })).get('fires')).toBe(
      '1',
    )
  })
})

describe('encodeState', () => {

  it('omits elevation params when unset', () => {
    const qs = encodeState(base)
    expect(qs).not.toContain('minel')
    expect(qs).not.toContain('maxel')
  })

  it('persists the CSV even when a polygon is present — inputs are additive', () => {
    const params = new URLSearchParams(encodeState({ ...base, customCsv: '46.8,-121.7' }))
    expect(params.get('customz')).toBeTruthy()
    expect(params.get('poly')).toBeTruthy()
    expect(params.get('type')).toBe('peak')
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

describe('pins in the URL', () => {
  const whitney = {
    label: 'Mount Whitney',
    description: '',
    kind: 'peak',
    lat: 36.57849,
    lon: -118.29194,
    elevationFt: 14505,
    osmId: 'node/944865772',
  }
  const coord = {
    label: '36.10000, -118.20000',
    description: '',
    kind: 'coordinates',
    lat: 36.1,
    lon: -118.2,
  }

  it('round-trips a peak pin with elevation and osm identity', () => {
    const out = roundTrip({ ...base, pins: [whitney] })
    expect(out?.pins).toEqual([whitney])
  })

  it('round-trips a bare coordinate pin (no elevation, no osmId)', () => {
    const out = roundTrip({ ...base, pins: [coord] })
    expect(out?.pins).toEqual([coord])
    // Absent fields stay absent, not undefined-valued.
    expect(out?.pins?.[0]).not.toHaveProperty('elevationFt')
    expect(out?.pins?.[0]).not.toHaveProperty('osmId')
  })

  it('survives a label containing the delimiters (comma and semicolon)', () => {
    const tricky = { ...coord, label: 'Cabin, mile 3; near creek' }
    const out = roundTrip({ ...base, pins: [tricky] })
    expect(out?.pins).toEqual([tricky])
  })

  it('round-trips multiple pins in order', () => {
    const out = roundTrip({ ...base, pins: [whitney, coord] })
    expect(out?.pins).toEqual([whitney, coord])
  })

  it('a lone pin is worth persisting (encodeState not empty)', () => {
    const qs = encodeState({ ...pristine, pins: [coord] })
    expect(qs).not.toBe('')
    expect(new URLSearchParams(qs).get('pins')).toBeTruthy()
  })

  it('drops malformed pin entries but keeps the valid ones', () => {
    // A valid pin, then an entry with a non-numeric coordinate.
    const decoded = decodeState('pins=-118.2,36.1,coordinates,,,A;notanum,36.1,,,,B')
    expect(decoded?.pins).toHaveLength(1)
    expect(decoded?.pins?.[0].label).toBe('A')
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

  it('maps legacy aggregation sort keys to their metric', () => {
    // Links shared before the metric × direction redesign keep working.
    expect(decodeState('sort=precip_max_in_hr')!.sortBy).toBe('precip_total_in')
    expect(decodeState('sort=wind_max_mph')!.sortBy).toBe('wind_avg_mph')
    expect(decodeState('sort=temp_min_f')!.sortBy).toBe('temp_avg_f')
    expect(decodeState('sort=temp_max_f')!.sortBy).toBe('temp_avg_f')
    expect(decodeState('sort=aqi_max')!.sortBy).toBe('aqi_avg')
    expect(decodeState('sort=not_a_metric')).toBeNull()
  })

  it('only honors desc=1 for the sort direction', () => {
    expect(decodeState('sort=temp_avg_f&desc=1')!.sortDesc).toBe(true)
    expect(decodeState('sort=temp_avg_f&desc=0')!.sortDesc).toBeUndefined()
  })

  it('rejects a malformed datetime', () => {
    expect(decodeState('start=yesterday')).toBeNull()
  })

  it('still decodes a legacy raw custom= link (shared before compression)', () => {
    const raw = '46.8529,-121.7604\n46.2024,-121.4909'
    const out = decodeState('type=custom&custom=' + encodeURIComponent(raw))
    expect(out!.customCsv).toBe(raw)
    // type=custom predates additive CSV — the picker falls back to its default.
    expect(out!.destinationType).toBeUndefined()
  })

  it('restores the CSV from a legacy type=custom&customz= link', () => {
    const csv = '46.8529,-121.7604,Mount Rainier'
    const qs = encodeState({ ...base, polygon: null, customCsv: csv })
    const customz = new URLSearchParams(qs).get('customz')!
    const out = decodeState(`type=custom&customz=${customz}`)
    expect(out!.customCsv).toBe(csv)
    expect(out!.destinationType).toBeUndefined()
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

  it('is order when the end is before the start', () => {
    expect(classifyWindow(shift(3), shift(1), now)).toBe('order')
  })

  it('flags an equal start and end — the point modes own zero-length analyses', () => {
    expect(classifyWindow(shift(1), shift(1), now)).toBe('equal')
  })

  it('prefers the equal warning over a horizon warning when both apply', () => {
    // Equal AND beyond the horizon: the actionable fix is switching modes
    // (or adding duration), so 'equal' wins like 'order' does.
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 5), shift(FUTURE_LIMIT_DAYS + 5), now)).toBe(
      'equal',
    )
  })

  it('prefers the order warning over a horizon warning when both apply', () => {
    // End far in the future but before the start — ordering is the actionable
    // problem, so it wins over the "future" classification.
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 10), shift(FUTURE_LIMIT_DAYS + 5), now)).toBe(
      'order',
    )
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

describe('resolveSearchWindow', () => {
  const now = new Date('2026-07-04T12:00')
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const shift = (days: number) => iso(new Date(now.getTime() + days * 86_400_000))
  const fallback = {
    start: now.toISOString(),
    end: new Date(now.getTime() + 3_600_000).toISOString(),
  }

  it('passes a usable panel window through as ISO instants', () => {
    const start = shift(1)
    const end = shift(4)
    expect(resolveSearchWindow(start, end, now)).toEqual({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    })
  })

  it('falls back to the next hour when End is unset (fresh session)', () => {
    expect(resolveSearchWindow(shift(1), '', now)).toEqual(fallback)
  })

  it('falls back when the window is reversed', () => {
    expect(resolveSearchWindow(shift(4), shift(1), now)).toEqual(fallback)
  })

  it('falls back on an equal window — zero-length belongs to the point modes', () => {
    const t = shift(1)
    expect(resolveSearchWindow(t, t, now)).toEqual(fallback)
  })

  it('falls back when the window is outside the servable range', () => {
    expect(
      resolveSearchWindow(shift(FUTURE_LIMIT_DAYS + 2), shift(FUTURE_LIMIT_DAYS + 5), now),
    ).toEqual(fallback)
  })

  it('keeps a recent-past window — history is analyzable', () => {
    const start = shift(-10)
    const end = shift(-8)
    expect(resolveSearchWindow(start, end, now)).toEqual({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    })
  })
})

describe('now mode (mode=now)', () => {
  it('encodes mode=now and omits the window dates', () => {
    const params = new URLSearchParams(encodeState({ ...base, mode: 'now' }))
    expect(params.get('mode')).toBe('now')
    // A shared "now" link re-samples at open time — the author's window
    // timestamps must not ride along.
    expect(params.get('start')).toBeNull()
    expect(params.get('end')).toBeNull()
    expect(params.get('at')).toBeNull()
  })

  it('is the default, so it does not make a pristine session worth persisting', () => {
    expect(encodeState({ ...pristine, mode: 'now' })).toBe('')
  })

  it('decodes mode=now', () => {
    expect(decodeState('mode=now')!.mode).toBe('now')
  })

  it('ignores unknown mode values', () => {
    expect(decodeState('mode=warp')?.mode).toBeUndefined()
  })

  it('round-trips', () => {
    expect(roundTrip({ ...base, mode: 'now' })!.mode).toBe('now')
  })
})

describe('window mode (mode=window)', () => {
  it('spells the mode out rather than implying it from the dates', () => {
    const params = new URLSearchParams(encodeState(base))
    expect(params.get('mode')).toBe('window')
    expect(params.get('start')).toBe('2026-07-04T06:00')
    expect(params.get('end')).toBe('2026-07-07T18:00')
    expect(params.get('at')).toBeNull()
  })

  it('is worth persisting on its own, now that "now" is the default', () => {
    expect(encodeState({ ...pristine, mode: 'window' })).not.toBe('')
  })

  it('decodes mode=window', () => {
    expect(decodeState('mode=window')!.mode).toBe('window')
  })

  it('round-trips', () => {
    const out = roundTrip(base)
    expect(out!.mode).toBe('window')
    expect(out!.startDatetime).toBe('2026-07-04T06:00')
    expect(out!.endDatetime).toBe('2026-07-07T18:00')
  })

  // Links shared before "now" became the default omitted `mode` entirely and
  // encoded the window as a bare start/end pair. Falling through to the new
  // default would turn someone's saved 3-day window into a single-hour
  // snapshot, so the dates stand in for the missing mode.
  it('infers window mode from a legacy link that carries dates but no mode', () => {
    expect(decodeState('type=peak&sort=precip_total_in&limit=10&start=2026-07-04T06:00&end=2026-07-07T18:00')!.mode)
      .toBe('window')
    expect(decodeState('start=2026-07-04T06:00')!.mode).toBe('window')
    expect(decodeState('end=2026-07-07T18:00')!.mode).toBe('window')
  })

  it('does not infer window mode from a legacy link with no dates at all', () => {
    expect(decodeState('type=peak&limit=10')?.mode).toBeUndefined()
  })

  // The inference keys off the parsed dates, not the raw params, so a garbled
  // date stays dropped instead of conjuring a mode out of nothing usable.
  it('does not infer window mode from a malformed date', () => {
    expect(decodeState('start=yesterday')).toBeNull()
    expect(decodeState('type=peak&end=teatime')?.mode).toBeUndefined()
  })

  // An explicit mode always wins: a "now" link that happens to carry stray
  // dates (hand-edited, or a truncated paste) must stay a "now" link.
  it('lets an explicit mode override the legacy date inference', () => {
    expect(decodeState('mode=now&start=2026-07-04T06:00')!.mode).toBe('now')
    expect(decodeState('mode=at&at=2026-07-06T15:00&end=2026-07-07T18:00')!.mode).toBe('at')
  })
})

describe('at mode (mode=at)', () => {
  const at = '2026-07-06T15:00'

  it('encodes mode=at with the moment, omitting the window dates', () => {
    const params = new URLSearchParams(encodeState({ ...base, mode: 'at', atDatetime: at }))
    expect(params.get('mode')).toBe('at')
    // Unlike "now", the chosen moment IS the analysis — it must ride along.
    expect(params.get('at')).toBe(at)
    expect(params.get('start')).toBeNull()
    expect(params.get('end')).toBeNull()
  })

  it('is worth persisting on its own', () => {
    expect(encodeState({ ...pristine, mode: 'at', atDatetime: at })).not.toBe('')
  })

  it('decodes mode=at with its moment', () => {
    const out = decodeState(`mode=at&at=${encodeURIComponent(at)}`)
    expect(out!.mode).toBe('at')
    expect(out!.atDatetime).toBe(at)
  })

  it('keeps the mode but drops a malformed moment', () => {
    const out = decodeState('mode=at&at=teatime')
    expect(out!.mode).toBe('at')
    expect(out!.atDatetime).toBeUndefined()
  })

  it('round-trips', () => {
    const out = roundTrip({ ...base, mode: 'at', atDatetime: at })
    expect(out!.mode).toBe('at')
    expect(out!.atDatetime).toBe(at)
  })

  it('omits an invalid moment from the encoded URL', () => {
    const params = new URLSearchParams(encodeState({ ...base, mode: 'at', atDatetime: '' }))
    expect(params.get('mode')).toBe('at')
    expect(params.get('at')).toBeNull()
  })
})

describe('classifyMoment', () => {
  const now = new Date('2026-07-04T12:00')
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const shift = (days: number) => iso(new Date(now.getTime() + days * 86_400_000))

  it('is ok for a near-future moment', () => {
    expect(classifyMoment(shift(1), now)).toBe('ok')
  })

  it('is ok for a recent-past moment — history is analyzable', () => {
    expect(classifyMoment(shift(-10), now)).toBe('ok')
  })

  it('is past beyond the history horizon', () => {
    expect(classifyMoment(shift(-(PAST_LIMIT_DAYS + 2)), now)).toBe('past')
  })

  it('is future beyond the forecast horizon', () => {
    expect(classifyMoment(shift(FUTURE_LIMIT_DAYS + 2), now)).toBe('future')
  })

  it('is ok while nothing is picked', () => {
    expect(classifyMoment('', now)).toBe('ok')
  })
})
