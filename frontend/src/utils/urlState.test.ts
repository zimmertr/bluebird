import { describe, it, expect } from 'vitest'
import {
  encodeState,
  decodeState,
  classifyWindow,
  classifyAqiCoverage,
  clampLimit,
  ShareableState,
} from './urlState'
import {
  AQI_LIMIT_DAYS,
  FUTURE_LIMIT_DAYS,
  ForecastSelection,
  PAST_LIMIT_DAYS,
  bandEnd,
} from './calendar'
import { GeoPolygon } from '../types'
import { NO_CONSTRAINTS } from './clientAnalyze'

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

// A four-day range off the calendar, whole days. `days` is the shape every
// selection but the When toggle's Current arm takes.
const DAYS: ForecastSelection = {
  kind: 'days',
  startDate: '2026-07-04',
  endDate: '2026-07-07',
}

// The deployment default, which encodeState needs so it can tell a chosen
// model from an inherited one. Any id would do; these tests are not about which.
const DEFAULT_MODEL = 'ecmwf_ifs025'

// A reach long enough that the API's hard date edge binds first, so the horizon
// assertions below test that edge rather than a model's.
const LONG_HOURS = 384

const base: ShareableState = {
  polygon,
  destinationTypes: ['peak'],
  selection: DAYS,
  forecastModel: DEFAULT_MODEL,
  sortBy: 'precip_total_in',
  sortDesc: false,
  minElevationFt: null,
  maxElevationFt: null,
  constraints: NO_CONSTRAINTS,
  limit: 10,
  customCsv: '',
  showWildfires: false,
  showRadar: false,
  showSmoke: false,
  showGrid: false,
  gridStyle: 'blocks' as const,
  includeUnnamedPeaks: false,
  pins: [],
}

// A truly untouched session: no polygon, no custom CSV, all controls at their
// App defaults — including the When toggle's Current arm, which is the one
// selection carrying no dates to write.
const pristine: ShareableState = {
  polygon: null,
  // Nothing checked is the default now, so a pristine session asks the
  // polygon to find nothing.
  destinationTypes: [],
  selection: { kind: 'now' },
  forecastModel: DEFAULT_MODEL,
  sortBy: 'precip_total_in',
  sortDesc: false,
  minElevationFt: null,
  maxElevationFt: null,
  constraints: NO_CONSTRAINTS,
  limit: 200,
  customCsv: '',
  showWildfires: false,
  showRadar: false,
  showSmoke: false,
  showGrid: false,
  gridStyle: 'blocks' as const,
  includeUnnamedPeaks: false,
  pins: [],
}

// Round-trip helper: encode, then decode the resulting query string.
function roundTrip(state: ShareableState) {
  return decodeState(encodeState(state, DEFAULT_MODEL))
}

describe('encodeState / decodeState round-trip', () => {
  it('restores a peak analysis with a polygon', () => {
    const out = roundTrip(base)
    expect(out).not.toBeNull()
    expect(out!.destinationTypes).toEqual(['peak'])
    expect(out!.selection).toEqual(DAYS)
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
    expect(encodeState(base, DEFAULT_MODEL)).not.toContain('desc')
    expect(roundTrip(base)!.sortDesc).toBeUndefined()
  })

  it('round-trips the wildfire overlay toggle', () => {
    const out = roundTrip({ ...base, showWildfires: true })
    expect(out!.showWildfires).toBe(true)
    // Off is the default and stays out of the URL entirely.
    expect(encodeState(base, DEFAULT_MODEL)).not.toContain('fires')
    expect(roundTrip(base)!.showWildfires).toBeUndefined()
  })

  it('round-trips the radar, smoke and grid overlays independently', () => {
    // Four layers, four params, and none of them implies another: a link
    // sharing a smoke picture must not switch radar on as a side effect.
    const both = roundTrip({ ...base, showRadar: true, showSmoke: true })
    expect(both!.showRadar).toBe(true)
    expect(both!.showSmoke).toBe(true)
    const radarOnly = roundTrip({ ...base, showRadar: true })
    expect(radarOnly!.showRadar).toBe(true)
    expect(radarOnly!.showSmoke).toBeUndefined()
    expect(radarOnly!.showGrid).toBeUndefined()
    const gridOnly = roundTrip({ ...base, showGrid: true })
    expect(gridOnly!.showGrid).toBe(true)
    expect(gridOnly!.showRadar).toBeUndefined()
    // Off is the default for all four and stays out of the URL entirely.
    const clean = encodeState(base, DEFAULT_MODEL)
    expect(clean).not.toContain('radar')
    expect(clean).not.toContain('smoke')
    expect(clean).not.toContain('grid')
  })

  it('carries the grid style in the same param as the toggle', () => {
    // One control, one param. Two would let a link say the layer is off while
    // still carrying a style for it, which is a state the panel cannot be in.
    expect(encodeState({ ...base, showGrid: true, gridStyle: 'smooth' }, DEFAULT_MODEL)).toContain(
      'grid=smooth',
    )
    expect(roundTrip({ ...base, showGrid: true, gridStyle: 'smooth' })!.gridStyle).toBe('smooth')
    expect(roundTrip({ ...base, showGrid: true, gridStyle: 'blocks' })!.gridStyle).toBe('blocks')
    // A style with the layer off writes nothing at all: there is no drawing to
    // describe, and a link should not reopen with a picker set for a layer the
    // reader has to switch on first.
    expect(encodeState({ ...base, gridStyle: 'smooth' }, DEFAULT_MODEL)).not.toContain('grid')
  })

  it('names the style in the param, and accepts nothing else', () => {
    expect(decodeState('?grid=blocks')).toEqual({ showGrid: true, gridStyle: 'blocks' })
    // An unrecognised value is no grid at all rather than a silent default: the
    // param carries the whole of the control's state, so a value it cannot read
    // is a link it cannot honour.
    expect(decodeState('?grid=fancy')).toBeNull()
    expect(decodeState('?grid=1')).toBeNull()
  })

  it('gives an overlay-only session a URL of its own', () => {
    // The overlays are the one kind of state with no analysis behind it, so a
    // pristine session that has only switched a layer on still deserves a link.
    expect(encodeState({ ...pristine, showSmoke: true }, DEFAULT_MODEL)).toContain('smoke=1')
    expect(encodeState({ ...pristine, showRadar: true }, DEFAULT_MODEL)).toContain('radar=1')
    // The grid needs an analysis before it draws anything, so a grid-only link
    // reopens on an empty map with the layer armed — which is still the state
    // that was shared, and dropping it would lose the one thing it said.
    expect(encodeState({ ...pristine, showGrid: true }, DEFAULT_MODEL)).toContain('grid=blocks')
  })

  it('keeps every overlay param hand-editable', () => {
    // Same convention as `fires`: a flag anyone can flip in the address bar,
    // never an opaque blob (#210).
    expect(decodeState('?radar=1&smoke=1&grid=smooth')).toEqual({
      showRadar: true,
      showSmoke: true,
      showGrid: true,
      gridStyle: 'smooth',
    })
    expect(decodeState('?radar=0&smoke=yes&grid=on')).toBeNull()
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
    expect(out!.destinationTypes).toEqual(['peak'])
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
    const qs = encodeState({ ...base, polygon: null, customCsv: csv }, DEFAULT_MODEL)
    const params = new URLSearchParams(qs)
    expect(params.get('custom')).toBeNull() // legacy raw key is not written
    const customz = params.get('customz')!
    expect(customz).toBeTruthy()
    expect(customz.length).toBeLessThan(csv.length * 0.6)
  })
})

describe('encodeState gate — what triggers a URL update', () => {
  it('returns "" for a pristine session (nothing the user set)', () => {
    expect(encodeState(pristine, DEFAULT_MODEL)).toBe('')
  })

  // The gate got simpler with the calendar rather than harder. The old window
  // was two timestamps pre-filled to "now", so a filled window could not be read
  // as intent — treating it as one would have written dates into the address bar
  // before the user did anything. A day, by contrast, is only ever there because
  // someone clicked it.
  it('syncs for a day selection alone — clicking a day is intent', () => {
    expect(encodeState({ ...pristine, selection: DAYS }, DEFAULT_MODEL)).not.toBe('')
    expect(
      encodeState({
        ...pristine,
        selection: { kind: 'days', startDate: '2026-07-04', endDate: '2026-07-04' },
      }, DEFAULT_MODEL),
    ).not.toBe('')
  })

  it('syncs when only an elevation constraint is set', () => {
    expect(encodeState({ ...pristine, minElevationFt: 8000 }, DEFAULT_MODEL)).not.toBe('')
    expect(encodeState({ ...pristine, maxElevationFt: 12000 }, DEFAULT_MODEL)).not.toBe('')
  })

  it('syncs when a non-default sort, direction, limit, or type is chosen', () => {
    expect(encodeState({ ...pristine, sortBy: 'wind_avg_mph' }, DEFAULT_MODEL)).not.toBe('')
    expect(encodeState({ ...pristine, sortDesc: true }, DEFAULT_MODEL)).not.toBe('')
    expect(encodeState({ ...pristine, limit: 25 }, DEFAULT_MODEL)).not.toBe('')
    expect(encodeState({ ...pristine, destinationTypes: ['trailhead'] }, DEFAULT_MODEL)).not.toBe('')
  })

  it('syncs on a CSV alone — no polygon or selection required', () => {
    const qs = encodeState({ ...pristine, customCsv: '46.8529,-121.7604' }, DEFAULT_MODEL)
    expect(qs).not.toBe('')
    expect(new URLSearchParams(qs).get('customz')).toBeTruthy()
  })

  it('syncs when the wildfire overlay is enabled', () => {
    expect(encodeState({ ...pristine, showWildfires: true }, DEFAULT_MODEL)).not.toBe('')
    expect(new URLSearchParams(encodeState({ ...pristine, showWildfires: true }, DEFAULT_MODEL)).get('fires')).toBe(
      '1',
    )
  })
})

describe('encodeState', () => {

  it('omits elevation params when unset', () => {
    const qs = encodeState(base, DEFAULT_MODEL)
    expect(qs).not.toContain('minel')
    expect(qs).not.toContain('maxel')
  })

  it('omits every forecast bound when unset', () => {
    const qs = encodeState(base, DEFAULT_MODEL)
    for (const param of ['minprecip', 'maxprecip', 'mintemp', 'maxtemp', 'minwind', 'maxwind', 'minaqi', 'maxaqi']) {
      expect(qs).not.toContain(param)
    }
  })

  it('round-trips every forecast bound, readably', () => {
    const constraints = {
      minPrecipTotalIn: 0.05,
      maxPrecipTotalIn: 0.1,
      minTempF: 20,
      maxTempF: 80,
      minWindMph: 1,
      maxWindMph: 20,
      minAqi: 10,
      maxAqi: 100,
    }
    const qs = encodeState({ ...base, constraints }, DEFAULT_MODEL)
    // Plain numbers under names you can guess, which is the whole convention:
    // a bound should be as editable in the address bar as it is in the panel.
    expect(new URLSearchParams(qs).get('maxaqi')).toBe('100')
    expect(new URLSearchParams(qs).get('maxprecip')).toBe('0.1')
    expect(decodeState(`?${qs}`)?.constraints).toEqual(constraints)
  })

  it('leaves a bound out of the decode when the link carries none', () => {
    // Undefined rather than an all-null object, so App keeps its own state
    // instead of being handed a value that says the same thing.
    expect(decodeState('?sort=precip_total_in')?.constraints).toBeUndefined()
  })

  it('earns a URL for a state whose only change is a bound', () => {
    // A filtered view is a shareable view, exactly as an elevation band is.
    expect(
      encodeState({ ...pristine, constraints: { ...NO_CONSTRAINTS, maxAqi: 100 } }, DEFAULT_MODEL),
    ).not.toBe('')
  })

  it('drops a bound that is not a number rather than taking NaN', () => {
    expect(decodeState('?maxaqi=smoky')?.constraints).toBeUndefined()
  })

  it('persists the CSV even when a polygon is present — inputs are additive', () => {
    const params = new URLSearchParams(encodeState({ ...base, customCsv: '46.8,-121.7' }, DEFAULT_MODEL))
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
    }, DEFAULT_MODEL)
    const poly = new URLSearchParams(qs).get('poly')!
    expect(poly.startsWith('-121.76042,46.85289')).toBe(true)
  })

  it('drops the closing vertex from the encoded polygon', () => {
    const poly = new URLSearchParams(encodeState(base, DEFAULT_MODEL)).get('poly')!
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
    const qs = encodeState({ ...pristine, pins: [coord] }, DEFAULT_MODEL)
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
    expect(out!.destinationTypes).toEqual(['peak'])
  })

  it('drops a polygon with fewer than 3 vertices', () => {
    expect(decodeState('poly=-121.5,46.8;-121.4,46.2')).toBeNull()
  })

  it('rejects an unknown destination type but keeps valid neighbors', () => {
    const out = decodeState('type=volcano&limit=50&sort=precip_total_in')
    expect(out!.destinationTypes).toBeUndefined()
    expect(out!.limit).toBe(50)
    expect(out!.sortBy).toBe('precip_total_in')
  })

  it('keeps a limit above any ceiling rather than dropping it (#191)', () => {
    // The ceiling belongs to /api/capabilities, not to this parser. Dropping
    // the value here is what made a shared link open at the default instead of
    // at the maximum; the caller clamps with clampLimit.
    expect(decodeState('limit=9999')!.limit).toBe(9999)
    expect(decodeState('limit=1501')!.limit).toBe(1501)
  })

  it('still drops a limit that is not a whole number of rows', () => {
    expect(decodeState('limit=0')).toBeNull()
    expect(decodeState('limit=-5')).toBeNull()
    expect(decodeState('limit=1.5')).toBeNull()
    expect(decodeState('limit=abc')).toBeNull()
    // A dropped limit must not take its valid neighbors with it.
    expect(decodeState('limit=0&sort=wind_avg_mph')!.limit).toBeUndefined()
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
    expect(out!.destinationTypes).toBeUndefined()
  })

  it('restores the CSV from a legacy type=custom&customz= link', () => {
    const csv = '46.8529,-121.7604,Mount Rainier'
    const qs = encodeState({ ...base, polygon: null, customCsv: csv }, DEFAULT_MODEL)
    const customz = new URLSearchParams(qs).get('customz')!
    const out = decodeState(`type=custom&customz=${customz}`)
    expect(out!.customCsv).toBe(csv)
    expect(out!.destinationTypes).toBeUndefined()
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
    expect(classifyWindow(shift(1), shift(4), now, LONG_HOURS)).toBe('ok')
  })

  it('is ok for a recent-past window still within the history horizon', () => {
    expect(classifyWindow(shift(-10), shift(-8), now, LONG_HOURS)).toBe('ok')
  })

  it('is past when the window ends before the history horizon', () => {
    expect(
      classifyWindow(
        shift(-(PAST_LIMIT_DAYS + 5)),
        shift(-(PAST_LIMIT_DAYS + 2)),
        now,
        LONG_HOURS,
      ),
    ).toBe('past')
  })

  it('is past when the window merely starts before the history horizon', () => {
    // Open-Meteo rejects out-of-range start dates, so a partial overhang fails too.
    expect(classifyWindow(shift(-(PAST_LIMIT_DAYS + 5)), shift(-10), now, LONG_HOURS)).toBe(
      'past',
    )
  })

  // The regression this pair exists for: the band offers whole days, so a window
  // ending at 23:59 on the last of them is exactly what the calendar produces.
  // Measuring the horizon as an instant `now + 15 days` refused it — Analyze went
  // dead on the last clickable column — so the bounds are day-granular now.
  it('accepts a window ending at the last minute of the last servable day', () => {
    // Read from the calendar's own far edge rather than computed here, so this
    // pins the two agreeing: whatever the grid offers, the guard must accept.
    expect(classifyWindow(iso(now), `${bandEnd(now, LONG_HOURS)}T23:59`, now, LONG_HOURS)).toBe('ok')
  })

  it('refuses a window reaching the day after the last servable one', () => {
    expect(classifyWindow(iso(now), shift(FUTURE_LIMIT_DAYS + 1), now, LONG_HOURS)).toBe('future')
  })

  it('is future when the window starts beyond the forecast horizon', () => {
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 2), shift(FUTURE_LIMIT_DAYS + 5), now, LONG_HOURS)).toBe(
      'future',
    )
  })

  it('is future when the window merely ends beyond the forecast horizon', () => {
    // Starts within the horizon but ends past it — Open-Meteo would 400 the
    // request, so this must warn rather than pass as ok.
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS - 1), shift(FUTURE_LIMIT_DAYS + 5), now, LONG_HOURS)).toBe(
      'future',
    )
  })

  it('is future for an absurdly long window (start now, end next year)', () => {
    expect(classifyWindow(shift(0), shift(365), now, LONG_HOURS)).toBe('future')
  })

  it('is ok when the window is incomplete', () => {
    expect(classifyWindow('', '', now, LONG_HOURS)).toBe('ok')
  })

  it('is order when the end is before the start', () => {
    expect(classifyWindow(shift(3), shift(1), now, LONG_HOURS)).toBe('order')
  })

  // Equal ends used to be a status of their own, pointing the user at one of the
  // two point-in-time pickers. Under the calendar, equal narrowed hours ARE how
  // you ask for a single hour, so flagging them would refuse the thing the
  // control exists for.
  it('accepts an equal start and end — a single hour is a legitimate window', () => {
    expect(classifyWindow(shift(1), shift(1), now, LONG_HOURS)).toBe('ok')
  })

  it('still flags an equal window that falls outside the horizon', () => {
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 5), shift(FUTURE_LIMIT_DAYS + 5), now, LONG_HOURS)).toBe(
      'future',
    )
  })

  it('prefers the order warning over a horizon warning when both apply', () => {
    // End far in the future but before the start — ordering is the actionable
    // problem, so it wins over the "future" classification.
    expect(classifyWindow(shift(FUTURE_LIMIT_DAYS + 10), shift(FUTURE_LIMIT_DAYS + 5), now, LONG_HOURS)).toBe(
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

  // Day-granular for the same reason, and for one more: the backend clamps its own
  // request to min(end.date(), today + 5 days), so coverage runs to the end of the
  // horizon day. An instant-based bound called that evening 'partial' while the
  // calendar drew the day as fully covered.
  it('is full through the last minute of the horizon day', () => {
    const h = new Date(now.getTime() + AQI_LIMIT_DAYS * 86_400_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}`

    expect(classifyAqiCoverage(iso(now), `${day}T23:59`, now)).toBe('full')
    expect(classifyAqiCoverage(iso(now), `${day}T23:59`, now)).not.toBe('partial')
  })

  it('is full for past windows (the AQI archive covers them)', () => {
    expect(classifyAqiCoverage(shift(-10), shift(-8), now)).toBe('full')
  })

  it('is full when the window is incomplete', () => {
    expect(classifyAqiCoverage('', '', now)).toBe('full')
  })
})

describe('the Current arm (mode=now)', () => {
  it('encodes mode=now and no days at all', () => {
    const params = new URLSearchParams(encodeState({ ...base, selection: { kind: 'now' } }, DEFAULT_MODEL))
    expect(params.get('mode')).toBe('now')
    // A shared "now" link re-samples at open time, so it must carry no dates.
    expect(params.get('d1')).toBeNull()
    expect(params.get('d2')).toBeNull()
    expect(params.get('h1')).toBeNull()
  })

  it('is the default, so it does not make a pristine session worth persisting', () => {
    expect(encodeState({ ...pristine, selection: { kind: 'now' } }, DEFAULT_MODEL)).toBe('')
  })

  it('decodes mode=now', () => {
    expect(decodeState('mode=now')!.selection).toEqual({ kind: 'now' })
  })

  it('ignores unknown mode values', () => {
    expect(decodeState('mode=warp')?.selection).toBeUndefined()
  })

  it('round-trips', () => {
    expect(roundTrip({ ...base, selection: { kind: 'now' } })!.selection).toEqual({ kind: 'now' })
  })
})

describe('a day selection (mode=days)', () => {
  it('spells the mode out even though d1 would imply it', () => {
    const params = new URLSearchParams(encodeState(base, DEFAULT_MODEL))
    expect(params.get('mode')).toBe('days')
    expect(params.get('d1')).toBe('2026-07-04')
    expect(params.get('d2')).toBe('2026-07-07')
  })

  it('omits d2 for a single day, keeping the common link short', () => {
    const params = new URLSearchParams(
      encodeState({
        ...base,
        selection: { kind: 'days', startDate: '2026-07-04', endDate: '2026-07-04' },
      }, DEFAULT_MODEL),
    )
    expect(params.get('d1')).toBe('2026-07-04')
    expect(params.get('d2')).toBeNull()
    expect(decodeState(params.toString())!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-04',
      endDate: '2026-07-04',
    })
  })

  it('writes the narrowed hours whenever the control is open, defaults included', () => {
    const narrowed: ForecastSelection = {
      ...DAYS,
      hours: { start: '06:00', end: '18:00' },
    }
    const params = new URLSearchParams(encodeState({ ...base, selection: narrowed }, DEFAULT_MODEL))
    expect(params.get('h1')).toBe('06:00')
    expect(params.get('h2')).toBe('18:00')
    expect(roundTrip({ ...base, selection: narrowed })!.selection).toEqual(narrowed)

    // The whole-day pair is the control's state, not only its effect: dropping it
    // would reopen the link with the disclosure closed.
    const wide: ForecastSelection = { ...DAYS, hours: { start: '00:00', end: '23:59' } }
    expect(roundTrip({ ...base, selection: wide })!.selection).toEqual(wide)
  })

  it('round-trips a whole-day range with no hours', () => {
    expect(roundTrip(base)!.selection).toEqual(DAYS)
  })

  it('orders the days however the link carries them', () => {
    expect(decodeState('mode=days&d1=2026-07-07&d2=2026-07-04')!.selection).toEqual(DAYS)
  })

  // The arm survives, the broken day does not: the link reopens on the empty
  // calendar instead of inventing a date or falling back to Current.
  it('drops an impossible day but keeps the Dates arm', () => {
    const pending = { kind: 'days', startDate: null, endDate: null }
    expect(decodeState('mode=days&d1=2026-02-30')?.selection).toEqual(pending)
    expect(decodeState('mode=days&d1=tomorrow')?.selection).toEqual(pending)
  })

  it('reopens a dateless Dates link on the empty calendar, hours kept', () => {
    expect(decodeState('mode=days')?.selection).toEqual({
      kind: 'days',
      startDate: null,
      endDate: null,
    })
    expect(decodeState('mode=days&h1=06:00&h2=18:00')?.selection).toEqual({
      kind: 'days',
      startDate: null,
      endDate: null,
      hours: { start: '06:00', end: '18:00' },
    })
  })

  it('falls back to a single day when d2 is unusable', () => {
    expect(decodeState('mode=days&d1=2026-07-04&d2=nonsense')!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-04',
      endDate: '2026-07-04',
    })
  })

  // Both or neither: one hour without the other describes no window, and
  // inventing the missing end from a default would invent a span.
  it('needs both hours to narrow, and rejects malformed ones', () => {
    expect(decodeState('mode=days&d1=2026-07-04&h1=06:00')!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-04',
      endDate: '2026-07-04',
    })
    expect(decodeState('mode=days&d1=2026-07-04&h1=06:00&h2=25:00')!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-04',
      endDate: '2026-07-04',
    })
  })
})

// Every link ever shared carries one of the three pre-calendar shapes. The old
// readers survive as a translation layer, the same way `custom` survives
// alongside `customz`: a link that silently restored as the wrong window would be
// worse than one that failed.
describe('links minted before the calendar', () => {
  it('translates a whole-day window into plain days', () => {
    expect(
      decodeState('mode=window&start=2026-07-04T00:00&end=2026-07-07T23:59')!.selection,
    ).toEqual(DAYS)
  })

  it('keeps a legacy window\'s times as the narrow-hours refinement', () => {
    expect(
      decodeState('mode=window&start=2026-07-04T06:00&end=2026-07-07T18:00')!.selection,
    ).toEqual({ ...DAYS, hours: { start: '06:00', end: '18:00' } })
  })

  it('translates a single moment into that day narrowed to that hour', () => {
    // Equal hours are how a point sample travels: the backend floors them to the
    // hour containing the moment, which is exactly what `at` meant.
    expect(decodeState('mode=at&at=2026-07-06T15:00')!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      hours: { start: '15:00', end: '15:00' },
    })
  })

  // Links shared before `mode` was written at all encoded the window as a bare
  // start/end pair. Falling through to today's default would turn someone's saved
  // three-day window into a snapshot of the moment they opened it.
  it('reads a bare start/end pair as the days it spanned', () => {
    expect(
      decodeState(
        'type=peak&sort=precip_total_in&limit=10&start=2026-07-04T00:00&end=2026-07-07T23:59',
      )!.selection,
    ).toEqual(DAYS)
  })

  it('reads one timestamp alone as that whole day, since it carries no span', () => {
    expect(decodeState('start=2026-07-04T06:00')!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-04',
      endDate: '2026-07-04',
    })
    expect(decodeState('end=2026-07-07T18:00')!.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-07',
      endDate: '2026-07-07',
    })
  })

  it('infers nothing from a legacy link with no dates at all', () => {
    expect(decodeState('type=peak&limit=10')?.selection).toBeUndefined()
  })

  // Keyed off the parsed dates, not the raw params, so a garbled date stays
  // dropped instead of conjuring a selection out of nothing usable.
  it('infers nothing from a malformed date', () => {
    expect(decodeState('start=yesterday')).toBeNull()
    expect(decodeState('type=peak&end=teatime')?.selection).toBeUndefined()
  })

  // An explicit mode still wins: a "now" link that happens to carry stray dates
  // (hand-edited, or a truncated paste) must stay a "now" link.
  it('lets an explicit mode=now override any dates riding along', () => {
    expect(decodeState('mode=now&start=2026-07-04T06:00')!.selection).toEqual({ kind: 'now' })
    expect(decodeState('mode=now&d1=2026-07-04')!.selection).toEqual({ kind: 'now' })
  })

  // The new params win over the old ones, so a link carrying both (a legacy link
  // reshared through the app, then hand-edited back) restores what the app wrote.
  it('prefers the calendar params when a link carries both shapes', () => {
    expect(
      decodeState('mode=days&d1=2026-07-04&d2=2026-07-07&at=2026-07-06T15:00')!.selection,
    ).toEqual(DAYS)
  })
})

describe('clampLimit', () => {
  it('passes an in-range row count through untouched', () => {
    expect(clampLimit(50, 1500)).toBe(50)
    expect(clampLimit(1500, 1500)).toBe(1500)
  })

  it('lowers a row count to the ceiling instead of discarding it', () => {
    expect(clampLimit(9999, 1500)).toBe(1500)
    expect(clampLimit(1501, 1500)).toBe(1500)
  })

  it('honors a lower ceiling than the compiled fallback', () => {
    // A self-hosted deployment publishing a smaller cap wins over the value
    // baked into the bundle, which is the point of reading it from the API.
    expect(clampLimit(9999, 500)).toBe(500)
  })

  it('raises a nonsensical row count to one row', () => {
    expect(clampLimit(0, 1500)).toBe(1)
    expect(clampLimit(-5, 1500)).toBe(1)
  })
})

describe('several destination types in one link', () => {
  it('round-trips a set, comma-joined and readable', () => {
    const qs = encodeState({ ...base, destinationTypes: ['peak', 'lake'] }, DEFAULT_MODEL)
    expect(qs).toContain('type=peak%2Clake')
    expect(decodeState(qs)!.destinationTypes).toEqual(['peak', 'lake'])
  })

  it('drops the param entirely when nothing is checked', () => {
    expect(encodeState({ ...base, destinationTypes: [] }, DEFAULT_MODEL)).not.toContain('type=')
  })

  it('keeps the types it recognizes and ignores the rest', () => {
    expect(decodeState('type=peak,volcano,lake')!.destinationTypes).toEqual(['peak', 'lake'])
  })

  it('collapses duplicates, since a set has no repeats', () => {
    expect(decodeState('type=lake,lake,peak')!.destinationTypes).toEqual(['lake', 'peak'])
  })

  it('leaves the field unset when no name is recognized, rather than guessing', () => {
    expect(decodeState('type=custom&limit=50')!.destinationTypes).toBeUndefined()
  })
})

describe('unnamed peaks in a link', () => {
  it('is absent by default, so it never makes a pristine session worth sharing', () => {
    expect(encodeState(pristine, DEFAULT_MODEL)).toBe('')
    expect(encodeState(base, DEFAULT_MODEL)).not.toContain('unnamed=')
  })

  it('round-trips when switched on', () => {
    const qs = encodeState({ ...base, includeUnnamedPeaks: true }, DEFAULT_MODEL)
    expect(qs).toContain('unnamed=1')
    expect(decodeState(qs)!.includeUnnamedPeaks).toBe(true)
  })

  it('alone is enough to make a session worth persisting', () => {
    expect(encodeState({ ...pristine, includeUnnamedPeaks: true }, DEFAULT_MODEL)).not.toBe('')
  })
})

describe('the forecast model in a link', () => {
  it('round-trips a chosen model', () => {
    const restored = roundTrip({ ...base, forecastModel: 'gfs_hrrr' })
    expect(restored?.forecastModel).toBe('gfs_hrrr')
  })

  // Written even at the default, like `mode` and `sort`. A link that left the
  // model to the reader's default would show different numbers the moment that
  // default moved, and the numbers are what was shared.
  it('writes the model even when it is the default', () => {
    expect(encodeState(base, DEFAULT_MODEL)).toContain(`model=${DEFAULT_MODEL}`)
  })

  // Every link shared before the picker existed carries no `model=`. Leaving
  // the field absent is what lets the caller apply its own default rather than
  // this module inventing one.
  it('leaves the model absent when a link does not name one', () => {
    expect(decodeState('?sort=precip_total_in&limit=10')?.forecastModel).toBeUndefined()
  })

  // Choosing a model is a real edit, so it alone deserves a URL. Without this
  // the one state that differs from the default would share as the default.
  it('gives an otherwise pristine session a URL once the model is chosen', () => {
    expect(encodeState(pristine, DEFAULT_MODEL)).toBe('')
    expect(encodeState({ ...pristine, forecastModel: 'gfs_hrrr' }, DEFAULT_MODEL)).toContain(
      'model=gfs_hrrr',
    )
  })

  // Shape only: the accepted set is the deployment's, from /api/capabilities,
  // and this module cannot see it. A garbled value is dropped so the caller
  // falls back rather than requesting nonsense.
  it('drops a value that could not be a model id', () => {
    expect(decodeState('?model=not a model')?.forecastModel).toBeUndefined()
    expect(decodeState('?model=gfs_hrrr')?.forecastModel).toBe('gfs_hrrr')
  })

  // The band the warnings read is the model's, so the same window is fine
  // under a global model and beyond the horizon under HRRR. If these two
  // disagreed, the calendar would draw a day as unpickable while the warning
  // called the window servable.
  it('classifies the same window against the model actually chosen', () => {
    const now = new Date(2026, 6, 15, 12, 0)
    const start = '2026-07-20T00:00'
    const end = '2026-07-20T23:59'
    expect(classifyWindow(start, end, now, LONG_HOURS)).toBe('ok')
    expect(classifyWindow(start, end, now, 42)).toBe('future')
  })
})
