import { describe, it, expect } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
import { decodeLink, decodeState as decodeWithLimits, encodeState, type ShareableState } from './urlState'
import { FIELD_PARAMS, MAX_CUSTOMZ_CHARS, URL_PARAMS } from './urlParams'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { NO_CONSTRAINTS } from './constraints'
import { MAX_ANALYZE_DESTINATIONS } from './clientAnalyze'
import { place } from '../testSupport/fixtures'

// The candidate cap as the app hands it over at mount.
const decodeState = (search: string) =>
  decodeWithLimits(search, { maxDestinations: MAX_ANALYZE_DESTINATIONS, maxPolygonPoints: MAX_POLYGON_POINTS })
// What `decodeState` answers for each state and link below, captured before
// the codec was a table. A share link is text someone already sent, so this
// pins the codec to those answers. Only a settled decision moves one: the
// retired keys read as nothing, and a default ranking or results cap is not
// written (#292).
import golden from './urlParams.golden.json'
import { MAX_POLYGON_POINTS } from './drawGeometry'

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
    snowfall: 'snowfall_max_in_hr',
    aqi: 'aqi_max',
    cloud_deck: 'cloud_deck_max_ft',
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
    minSnowfallTotalIn: 2,
    maxSnowfallTotalIn: 80,
    minAqi: 0,
    maxAqi: 50,
    minCloudDeckFt: 3000,
    maxCloudDeckFt: 15000,
  },
  limit: 50,
  customCsv: 'Name,Lat,Lon\nA peak,46.85,-121.76\n',
  showWildfires: true,
  showAreaClosures: true,
  showTrailClosures: true,
  showRadar: true,
  showSmoke: true,
  showSnow: true,
  showGrid: true,
  showContours: true,
  showRelief: true,
  showSlope: true,
  showSatellite: true,
  baseOpacity: { satellite: 80, topo: 30, relief: 100, slope: 0 },
  showTerrain: true,
  showFireActivity: true,
  gridStyle: 'smooth',
  showPlayer: false,
  gridReachFrac: 0.4,
  pins: [
    place({ label: 'Tricky, name; & co %', elevationFt: 14505, osmId: 'node/123' }),
    place({ label: '', kind: 'coordinates', lat: 36.123456, lon: -118.2 }),
  ],
  removed: ['46.85289,-121.76041', '48.10000,-121.11391'],
  tableSort: { key: 'elevation_ft', desc: true },
  view: { lng: -121.612345, lat: 47.1, zoom: 9.456 },
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
  constraints: { ...NO_CONSTRAINTS, maxCloudDeckFt: 9000 },
  limit: 200,
  customCsv: '',
  showWildfires: false,
  showAreaClosures: false,
  showTrailClosures: false,
  showRadar: false,
  showSmoke: false,
  showSnow: false,
  showGrid: false,
  showContours: false,
  showRelief: false,
  showSlope: false,
  showSatellite: false,
  showTerrain: false,
  showFireActivity: false,
  showPlayer: true,
  pins: [],
  removed: [],
  tableSort: null,
  view: null,
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
      'type=peak,lake&sort=wind_max_mph&desc=1&aqi=max&cloud_deck=max&precip=avg&snowfall=max&temp=max' +
        '&limit=50&model=gfs_hrrr&compare=icon_seamless,ecmwf_ifs025' +
        '&mode=days&d1=2026-07-04&d2=2026-07-07&h1=06:00&h2=18:30' +
        '&minprecip=0&maxprecip=0.25&mintemp=-10&maxtemp=85.5&minwind=1&maxwind=30' +
        '&minfreeze=4000&maxfreeze=12000&minsnowfall=2&maxsnowfall=80&minaqi=0&maxaqi=50' +
        '&minclouddeck=3000&maxclouddeck=15000' +
        '&poly=-121.76041,46.85289;-121.49094,46.20241;-121.11391,48.11223' +
        '&customz=HIQwtgpgNAMiAusD2A7AUAQQAQAcIgGsoAWANgDoAOAVigFoBGAJgfIHZS0g' +
        '&fires=1&closedareas=1&closedtrails=1&radar=1&smoke=1&snow=1' +
        '&topo=1&topoopacity=30&relief=1&reliefopacity=100&slope=1&slopeopacity=0&satellite=1&satelliteopacity=80' +
        '&terrain=1&fireactivity=1&grid=smooth&reach=40&player=0&unnamed=1' +
        '&pins=-121.8144,48.7768,peak,14505,node/123,Tricky%2C+name%3B+%26+co+%25' +
        ';-118.2,36.12346,coordinates,,,' +
        '&removed=-121.76041,46.85289;-121.11391,48.1&tsort=elevation_ft&tdesc=1&view=-121.6123,47.1,9.46',
    )
    expect(encodeState(nowOnly, DEFAULT_MODEL)).toBe('model=icon_seamless&mode=now&maxclouddeck=9000&player=1')
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
  // `end`, which have no reader and restore nothing, a `sort` that outranks
  // its own family's param, a reach without a grid, and values each reader
  // must drop.
  it.each(golden.links)('reads "$q" as it did', ({ q, dec }) => {
    expect(decodeState(q)).toEqual(dec)
  })

  // Snow depth left the ranking in #678. A link sent before then ranked on it
  // or bounded it, and must still open: on the default ranking, with the old
  // bounds read as nothing and the rest of the link kept.
  it('opens a link ranked on snow depth with the default ranking', () => {
    const out = decodeState('sort=snow_depth_in&desc=1&minsnow=2&maxsnow=80&limit=50&snow=1')
    expect(out).not.toBeNull()
    expect(out?.sortBy).toBeUndefined()
    expect(out?.rowKeys).toBeUndefined()
    expect(out?.constraints).toBeUndefined()
    expect(out).toMatchObject({ sortDesc: true, limit: 50, showSnow: true })
  })
})

describe('the codec table', () => {
  it('holds one row per key, in the order a link writes them', () => {
    expect(URL_PARAMS.map((row) => row.key)).toEqual([
      'type',
      'sort',
      'desc',
      'aqi',
      'cloud_deck',
      'freeze',
      'precip',
      'snowfall',
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
      'minsnowfall',
      'maxsnowfall',
      'minaqi',
      'maxaqi',
      'minclouddeck',
      'maxclouddeck',
      'poly',
      'customz',
      'fires',
      'closedareas',
      'closedtrails',
      'radar',
      'smoke',
      'snow',
      'topo',
      'topoopacity',
      'relief',
      'reliefopacity',
      'slope',
      'slopeopacity',
      'satellite',
      'satelliteopacity',
      'terrain',
      'fireactivity',
      'grid',
      'reach',
      'player',
      'unnamed',
      'pins',
      'removed',
      'tsort',
      'tdesc',
      'view',
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

// What a link carried and could not restore (#803, M6). The three a reader
// would otherwise lose without a word come back beside the state, and the
// rest of the link still opens.
describe('decodeLink', () => {
  const LIMITS = { maxDestinations: 3, maxPolygonPoints: 5 }
  const ring = (pairs: number) =>
    Array.from({ length: pairs }, (_, i) => `${-121 - i / 1e4},${46 + (i % 2) / 1e4}`).join(';')
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `47.${i},-121.${i},Peak ${i}`).join('\n')
  const customz = (text: string) => `customz=${compressToEncodedURIComponent(text)}`

  it('reports nothing for a link that restores whole', () => {
    const out = decodeLink(`type=peak&model=gfs_hrrr&poly=${ring(4)}&${customz(rows(3))}`, LIMITS)
    expect(out.dropped).toEqual([])
    expect(out.state?.polygon?.coordinates[0]).toHaveLength(5)
    expect(out.state?.customCsv).toBe(rows(3))
    expect(out.state?.forecastModel).toBe('gfs_hrrr')
  })

  it('reports a ring over the published cap, and keeps the rest of the link', () => {
    const out = decodeLink(`type=peak&poly=${ring(5)}`, LIMITS)
    expect(out.dropped).toEqual(['ring'])
    expect(out.state?.polygon).toBeUndefined()
    expect(out.state?.destinationTypes).toEqual(['peak'])
  })

  // The sentence says the ring could not be restored, which is as true of a
  // ring the link garbled as of one over the cap.
  it('reports a ring it could not read', () => {
    expect(decodeLink('type=peak&poly=notcoords', LIMITS).dropped).toEqual(['ring'])
    expect(decodeLink('type=peak&poly=-121.5,46.8;-121.4,46.2', LIMITS).dropped).toEqual(['ring'])
  })

  it('reports a list over the published cap, and keeps the rest of the link', () => {
    const out = decodeLink(`type=peak&${customz(rows(4))}`, LIMITS)
    expect(out.dropped).toEqual(['list'])
    expect(out.state?.customCsv).toBeUndefined()
    expect(out.state?.destinationTypes).toEqual(['peak'])
  })

  it('reports a list longer than a link can carry', () => {
    expect(decodeLink(`type=peak&customz=${'A'.repeat(MAX_CUSTOMZ_CHARS + 1)}`, LIMITS).dropped).toEqual(['list'])
  })

  it('reports a model id it could not read', () => {
    const out = decodeLink('type=peak&model=not a model', LIMITS)
    expect(out.dropped).toEqual(['model'])
    expect(out.state?.forecastModel).toBeUndefined()
  })

  // Membership is the caller's to judge (`useForecastSelection`): a
  // well-formed id the deployment does not publish is not dropped here.
  it('leaves a well-formed model id to the caller', () => {
    expect(decodeLink('model=retired_model', LIMITS).dropped).toEqual([])
  })

  // An empty value is a link that carried nothing, not one that lost something.
  it('reports nothing for an empty value', () => {
    expect(decodeLink('type=peak&poly=&customz=&model=', LIMITS).dropped).toEqual([])
  })

  it('reports each kind once, in the table order', () => {
    const out = decodeLink(`${customz(rows(4))}&model=bad id&poly=${ring(9)}`, LIMITS)
    expect(out.dropped).toEqual(['model', 'ring', 'list'])
    // Nothing was restored, which `decodeState` has always answered as null.
    expect(out.state).toBeNull()
  })
})
