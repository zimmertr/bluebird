import { describe, it, expect } from 'vitest'
import { decodeState, encodeState, type ShareableState } from './urlState'
import { FIELD_PARAMS, URL_PARAMS } from './urlParams'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { NO_CONSTRAINTS } from './constraints'
import { place } from '../testSupport/fixtures'
// What `decodeState` answers for each state and link below, captured before
// the codec was a table. A share link is text someone already sent, so this
// pins the codec to those answers. Only a settled decision moves one: the
// retired keys read as nothing, and a default ranking or results cap is not
// written (#292).
import golden from './urlParams.golden.json'

const DEFAULT_MODEL = 'ecmwf_ifs025'

// Every parameter written at once, off its default, with the values the
// encoding has to protect: a comma, a semicolon, an ampersand, a percent sign
// and a slash in a pin, a negative and a fractional bound, and a CSV that only
// travels compressed.
const full: ShareableState = {
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-121.760414, 46.852891],
        [-121.49094, 46.20241],
        [-121.11391, 48.112234],
        [-121.760414, 46.852891],
      ],
    ],
  },
  destinationTypes: ['peak', 'lake'],
  includeUnnamedPeaks: true,
  selection: {
    kind: 'days',
    startDate: '2026-07-04',
    endDate: '2026-07-07',
    hours: { start: '06:00', end: '18:30' },
  },
  forecastModel: 'gfs_hrrr',
  compareModels: ['icon_seamless', 'ecmwf_ifs025'],
  sortBy: 'wind_max_mph',
  sortDesc: true,
  rowKeys: {
    ...DEFAULT_FAMILY_KEY,
    wind: 'wind_max_mph',
    temp: 'temp_max_f',
    precip: 'precip_avg_in_hr',
    aqi: 'aqi_max',
    cloud_cover: 'cloud_cover_min_pct',
  },
  constraints: {
    minPrecipTotalIn: 0,
    maxPrecipTotalIn: 0.25,
    minTempF: -10,
    maxTempF: 85.5,
    minWindMph: 1,
    maxWindMph: 30,
    minFreezeFt: 4000,
    maxFreezeFt: 12000,
    minSnowDepthIn: 2,
    maxSnowDepthIn: 80,
    minAqi: 0,
    maxAqi: 50,
    minCloudBaseFt: 3000,
    maxCloudBaseFt: 15000,
    minCloudCoverPct: 5,
    maxCloudCoverPct: 60,
  },
  limit: 50,
  customCsv: 'Name,Lat,Lon\nA peak,46.85,-121.76\n',
  showWildfires: true,
  showRadar: true,
  showSmoke: true,
  showSnow: true,
  showGrid: true,
  gridStyle: 'smooth',
  showPlayer: false,
  gridReachFrac: 0.4,
  pins: [
    place({ label: 'Tricky, name; & co %', elevationFt: 14505, osmId: 'node/123' }),
    place({ label: '', kind: 'coordinates', lat: 36.123456, lon: -118.2 }),
  ],
}

// The Current arm with only the model, one bound and the player decided.
const nowOnly: ShareableState = {
  ...full,
  polygon: null,
  destinationTypes: [],
  includeUnnamedPeaks: false,
  selection: { kind: 'now' },
  forecastModel: 'icon_seamless',
  compareModels: [],
  sortBy: 'aqi_avg',
  sortDesc: false,
  rowKeys: { ...DEFAULT_FAMILY_KEY },
  constraints: { ...NO_CONSTRAINTS, maxCloudCoverPct: 60 },
  limit: 200,
  customCsv: '',
  showWildfires: false,
  showRadar: false,
  showSmoke: false,
  showSnow: false,
  showGrid: false,
  showPlayer: true,
  pins: [],
}

// The dateless Dates arm with its hours open, and the grid at its default reach.
const dateless: ShareableState = {
  ...nowOnly,
  forecastModel: DEFAULT_MODEL,
  selection: { kind: 'days', startDate: null, endDate: null, hours: { start: '00:00', end: '23:59' } },
  sortBy: 'temp_min_f',
  showGrid: true,
  gridStyle: 'blocks',
  gridReachFrac: 0.5,
  showPlayer: null,
  constraints: NO_CONSTRAINTS,
}

describe('the codec table against the links it wrote before', () => {
  it('writes every parameter in the same order and spelling', () => {
    expect(encodeState(full, DEFAULT_MODEL)).toBe(
      'type=peak,lake&sort=wind_max_mph&desc=1&aqi=max&cloud_cover=min&precip=avg&temp=max' +
        '&limit=50&model=gfs_hrrr&compare=icon_seamless,ecmwf_ifs025' +
        '&mode=days&d1=2026-07-04&d2=2026-07-07&h1=06:00&h2=18:30' +
        '&minprecip=0&maxprecip=0.25&mintemp=-10&maxtemp=85.5&minwind=1&maxwind=30' +
        '&minfreeze=4000&maxfreeze=12000&minsnow=2&maxsnow=80&minaqi=0&maxaqi=50' +
        '&mincloudbase=3000&maxcloudbase=15000&mincloudcover=5&maxcloudcover=60' +
        '&poly=-121.76041,46.85289;-121.49094,46.20241;-121.11391,48.11223' +
        '&customz=HIQwtgpgNAMiAusD2A7AUAQQAQAcIgGsoAWANgDoAOAVigFoBGAJgfIHZS0g' +
        '&fires=1&radar=1&smoke=1&snow=1&grid=smooth&reach=40&player=0&unnamed=1' +
        '&pins=-121.8144,48.7768,peak,14505,node/123,Tricky%2C+name%3B+%26+co+%25' +
        ';-118.2,36.12346,coordinates,,,',
    )
    expect(encodeState(nowOnly, DEFAULT_MODEL)).toBe('model=icon_seamless&mode=now&maxcloudcover=60&player=1')
    expect(encodeState(dateless, DEFAULT_MODEL)).toBe(
      'sort=temp_min_f&model=ecmwf_ifs025&mode=days&h1=00:00&h2=23:59&grid=blocks',
    )
  })

  it('reads each written link back to the same state', () => {
    expect(decodeState(encodeState(full, DEFAULT_MODEL))).toEqual(golden.full)
    expect(decodeState(encodeState(nowOnly, DEFAULT_MODEL))).toEqual(golden.nowOnly)
    expect(decodeState(encodeState(dateless, DEFAULT_MODEL))).toEqual(golden.dateless)
  })

  // Hand-edited, retired and malformed links: `custom`, `at`, `start` and
  // `end`, which nothing reads since the legacy readers left, a `sort` that
  // outranks its own family's param, a reach without a grid, and values each
  // reader must drop.
  it.each(golden.links)('reads "$q" as it did', ({ q, dec }) => {
    expect(decodeState(q)).toEqual(dec)
  })
})

describe('the codec table', () => {
  it('names each key once', () => {
    const keys = URL_PARAMS.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('holds one row per key, in the order a link writes them', () => {
    expect(URL_PARAMS.map((row) => row.key)).toEqual([
      'type',
      'sort',
      'desc',
      'aqi',
      'cloud_base',
      'cloud_cover',
      'freeze',
      'precip',
      'temp',
      'wind',
      'limit',
      'model',
      'compare',
      'mode',
      'd1',
      'd2',
      'h1',
      'h2',
      'minprecip',
      'maxprecip',
      'mintemp',
      'maxtemp',
      'minwind',
      'maxwind',
      'minfreeze',
      'maxfreeze',
      'minsnow',
      'maxsnow',
      'minaqi',
      'maxaqi',
      'mincloudbase',
      'maxcloudbase',
      'mincloudcover',
      'maxcloudcover',
      'poly',
      'customz',
      'fires',
      'radar',
      'smoke',
      'snow',
      'grid',
      'reach',
      'player',
      'unnamed',
      'pins',
    ])
  })

  // The typecheck fails a field missing from FIELD_PARAMS; this fails a name
  // there that no row answers to, and a row no field claims.
  it('gives every field of the state a param, and every param a field', () => {
    const rows = URL_PARAMS.map((row) => row.key).sort()
    const claimed = [...new Set(Object.values(FIELD_PARAMS).flat())].sort()
    expect(claimed).toEqual(rows)
  })
})
