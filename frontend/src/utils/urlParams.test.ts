import { describe, it, expect } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
import { decodeLink, decodeState as decodeWithLimits, encodeState, type ShareableState } from './urlState'
import { FIELD_PARAMS, MAX_CUSTOMZ_CHARS, URL_PARAMS, customCsvTooLong } from './urlParams'
import { PRESET_LISTS } from './presetLists'
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
// written (#292). #864 moved it once, by the maintainer's word that no old
// link need open: three habits left the link for the browser's storage,
// three keys took their neighbours' spelling, and the camera took its angle.
import golden from './urlParams.golden.json'
import { MAX_POLYGON_POINTS } from './drawGeometry'

const DEFAULT_MODEL = 'ecmwf_ifs025'
const LIMITS = { maxDestinations: MAX_ANALYZE_DESTINATIONS, maxPolygonPoints: MAX_POLYGON_POINTS }

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
    minSnowDepthIn: 12,
    maxSnowDepthIn: 120,
    maxSnowfallTotalIn: 80,
    minAqi: 0,
    maxAqi: 50,
    minCloudDeckFt: 3000,
    maxCloudDeckFt: 15000,
  },
  limit: 50,
  customCsv: 'Name,Lat,Lon\nA peak,46.85,-121.76\n',
  presetList: null,
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
  showTerrain: true,
  showFireActivity: true,
  gridStyle: 'smooth',
  gridReachFrac: 0.4,
  pins: [
    place({ label: 'Tricky, name; & co %', elevationFt: 14505, osmId: 'node/123' }),
    place({ label: '', kind: 'coordinates', lat: 36.123456, lon: -118.2 }),
  ],
  removed: ['46.85289,-121.76041', '48.10000,-121.11391'],
  tableSort: { key: 'elevation_ft', desc: true },
  chart: ['temp', 'precip'],
  view: { lng: -121.612345, lat: 47.1, zoom: 9.456, bearing: -32.4, pitch: 45.2 },
}

// The Current arm with only the model and one bound.
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
  pins: [],
  removed: [],
  tableSort: null,
  chart: ['aqi'],
  view: null,
}

// The dateless Dates arm with its hours open, and the grid at its default reach.
const dateless: ShareableState = {
  ...nowOnly,
  forecastModel: DEFAULT_MODEL,
  selection: { kind: 'days', startDate: null, endDate: null, hours: { start: '00:00', end: '23:59' } },
  sortBy: 'temp_min_f',
  chart: ['temp'],
  showGrid: true,
  gridStyle: 'blocks',
  gridReachFrac: 0.5,
  constraints: NO_CONSTRAINTS,
}

describe('the codec table against the links it wrote before', () => {
  it('writes every parameter in the same order and spelling', () => {
    expect(encodeState(full, DEFAULT_MODEL)).toBe(
      'type=peak,lake&sort=wind_max_mph&desc=1&aqi=max&clouddeck=max&precip=avg&snowfall=max&temp=max' +
        '&limit=50&model=gfs_hrrr&compare=icon_seamless,ecmwf_ifs025&chart=temp,precip' +
        '&mode=days&d1=2026-07-04&d2=2026-07-07&h1=06:00&h2=18:30' +
        '&minprecip=0&maxprecip=0.25&mintemp=-10&maxtemp=85.5&minwind=1&maxwind=30' +
        '&minfreeze=4000&maxfreeze=12000&minsnowfall=2&maxsnowfall=80&minaqi=0&maxaqi=50' +
        '&minclouddeck=3000&maxclouddeck=15000' +
        '&poly=-121.76041,46.85289;-121.49094,46.20241;-121.11391,48.11223' +
        '&customz=HIQwtgpgNAMiAusD2A7AUAQQAQAcIgGsoAWANgDoAOAVigFoBGAJgfIHZS0g' +
        '&wildfires=1&closedareas=1&closedtrails=1&radar=1&smoke=1&snowdepth=1' +
        '&topo=1&relief=1&slope=1&satellite=1' +
        '&terrain=1&fireactivity=1&grid=smooth&reach=40&unnamed=1' +
        '&pins=-121.8144,48.7768,peak,14505,node/123,Tricky%2C+name%3B+%26+co+%25' +
        ';-118.2,36.12346,coordinates,,,' +
        '&removed=-121.76041,46.85289;-121.11391,48.1&tsort=elevation_ft&tdesc=1&view=-121.6123,47.1,9.46,-32,45',
    )
    expect(encodeState(nowOnly, DEFAULT_MODEL)).toBe('model=icon_seamless&mode=now&maxclouddeck=9000')
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
    const out = decodeState('sort=snow_depth_in&desc=1&minsnow=2&maxsnow=80&limit=50&snowdepth=1')
    expect(out).not.toBeNull()
    expect(out?.sortBy).toBeUndefined()
    expect(out?.rowKeys).toBeUndefined()
    expect(out?.constraints).toBeUndefined()
    expect(out).toMatchObject({ sortDesc: true, limit: 50, showSnow: true })
  })

  // #864, by the maintainer's word (2026-11-04): no old key is read and no
  // old name is an alias. The three habits are the browser's now, and the
  // three renamed keys answer only to their new spelling.
  it('reads nothing from the keys #864 retired or renamed', () => {
    expect(
      decodeState(
        'layout=row&player=1&topo=1&topoopacity=30&satelliteopacity=80&fires=1&snow=1&cloud_deck=max',
      ),
    ).toEqual({ showContours: true })
  })
})

// The chart's metrics (#499): every slot, first panel first, comma joined, and
// written only when the chart is not the one a fresh session draws.
describe('the chart param', () => {
  const encodeChart = (chart: ShareableState['chart'], sortBy: ShareableState['sortBy'] = 'wind_max_mph') =>
    encodeState({ ...full, sortBy, chart }, DEFAULT_MODEL).match(/(?:^|&)chart=([^&]*)/)?.[1] ?? null

  it('writes every slot, and one name for one panel', () => {
    expect(encodeChart(['precip', 'temp'])).toBe('precip,temp')
    expect(encodeChart(['precip', 'temp', 'wind', 'aqi'])).toBe('precip,temp,wind,aqi')
    expect(encodeChart(['temp'])).toBe('temp')
  })

  it('leaves the param out while the chart follows the ranking alone', () => {
    expect(encodeChart(['wind'])).toBeNull()
    expect(encodeChart(['wind', 'aqi'])).toBe('wind,aqi')
  })

  it('makes a link by itself', () => {
    expect(encodeState({ ...nowOnly, forecastModel: DEFAULT_MODEL, constraints: NO_CONSTRAINTS, chart: ['aqi', 'temp'] }, DEFAULT_MODEL)).toContain(
      'chart=aqi,temp',
    )
  })

  it('reads a link tolerantly', () => {
    expect(decodeState('chart=precip,temp')?.chart).toEqual(['precip', 'temp'])
    expect(decodeState('chart=precip,temp,wind,aqi')?.chart).toEqual(['precip', 'temp', 'wind', 'aqi'])
    expect(decodeState('chart=temp')?.chart).toEqual(['temp'])
    expect(decodeState('chart=nope,temp')?.chart).toEqual(['temp'])
    expect(decodeState('chart=temp,temp')?.chart).toEqual(['temp'])
    expect(decodeState('chart=temp,wind,aqi,precip,freeze')?.chart).toEqual(['temp', 'wind', 'aqi', 'precip'])
    expect(decodeState('chart=,&limit=50')?.chart).toBeUndefined()
  })
})

describe('the codec table', () => {
  it('holds one row per key, in the order a link writes them', () => {
    expect(URL_PARAMS.map((row) => row.key)).toEqual([
      'type',
      'sort',
      'desc',
      'aqi',
      'clouddeck',
      'freeze',
      'precip',
      'snowfall',
      'temp',
      'wind',
      'limit',
      'model',
      'compare',
      'chart',
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
      'list',
      'wildfires',
      'closedareas',
      'closedtrails',
      'radar',
      'smoke',
      'snowdepth',
      'topo',
      'relief',
      'slope',
      'satellite',
      'terrain',
      'fireactivity',
      'grid',
      'reach',
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

  // A key is one lower-case word a reader can type (#864): `cloud_deck` was
  // the one with an underscore, beside its own `minclouddeck`.
  it('spells every key in lower-case letters and digits', () => {
    for (const { key } of URL_PARAMS) expect(key).toMatch(/^[a-z0-9]+$/)
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

// A ready-made list by name (#864): the link names the list the box holds
// rather than carrying its rows, and carries the reader's own rows as before.
describe('the list param', () => {
  const list = PRESET_LISTS[0]
  const picked: ShareableState = { ...nowOnly, customCsv: '46.85,-121.76,Mount Rainier', presetList: list.id }

  it('names a ready-made list in place of its rows', () => {
    const query = encodeState(picked, DEFAULT_MODEL)
    expect(query).toContain(`list=${list.id}`)
    expect(query).not.toContain('customz=')
  })

  it('carries rows of the reader\'s own as rows', () => {
    const query = encodeState({ ...picked, presetList: null }, DEFAULT_MODEL)
    expect(query).toContain('customz=')
    expect(query).not.toContain('list=')
  })

  // A list a link named whose rows have not arrived: the box is still empty,
  // and the address bar keeps naming the list.
  it('makes a link by itself, before its rows are in the box', () => {
    expect(
      encodeState({ ...nowOnly, forecastModel: DEFAULT_MODEL, constraints: NO_CONSTRAINTS, presetList: list.id }, DEFAULT_MODEL),
    ).toContain(`list=${list.id}`)
  })

  it('reads the id of a list this build ships, and no rows', () => {
    const out = decodeLink(`list=${list.id}`, LIMITS)
    expect(out).toEqual({ state: { presetList: list.id }, dropped: [] })
  })

  it('reports an id this build does not ship as a lost list', () => {
    expect(decodeLink('type=peak&list=no-such-list', LIMITS)).toEqual({
      state: { destinationTypes: ['peak'] },
      dropped: ['list'],
    })
  })

  it('reports nothing for an empty value', () => {
    expect(decodeLink('type=peak&list=', LIMITS).dropped).toEqual([])
  })

  // Only a hand-edited link carries both. The rows are what it spelled out.
  it('keeps the rows of a link that carries both', () => {
    const rows = '47.1,-121.1,Mine'
    const out = decodeLink(`customz=${compressToEncodedURIComponent(rows)}&list=${list.id}`, LIMITS)
    expect(out.state).toEqual({ customCsv: rows })
    expect(out.dropped).toEqual([])
  })

  it('gives every shipped list an id a link can carry as it is', () => {
    for (const { id } of PRESET_LISTS) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
})

// The writer checks the cap the reader holds a pasted list to (#864): a list
// whose compressed text is over it is left out of the link, so no link the
// app writes drops its own list on a reload.
describe('a pasted list too long for a link', () => {
  // Rows that do not compress into each other: each name is its own digits.
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => `${(40 + ((i * 7919) % 9973) / 1000).toFixed(5)},${(-120 - ((i * 104729) % 9949) / 1000).toFixed(5)},Peak ${(i * 2654435761) % 1000003}`).join('\n')
  const state = (customCsv: string, presetList: string | null = null): ShareableState => ({ ...nowOnly, customCsv, presetList })

  it('writes a list whose compressed text is inside the cap', () => {
    const short = rows(100)
    expect(compressToEncodedURIComponent(short).length).toBeLessThanOrEqual(MAX_CUSTOMZ_CHARS)
    expect(customCsvTooLong(state(short))).toBe(false)
    const query = encodeState(state(short), DEFAULT_MODEL)
    expect(decodeState(query)?.customCsv).toBe(short)
  })

  it('leaves out a list whose compressed text is over the cap, and keeps the rest of the link', () => {
    const long = rows(1_400)
    expect(compressToEncodedURIComponent(long).length).toBeGreaterThan(MAX_CUSTOMZ_CHARS)
    expect(customCsvTooLong(state(long))).toBe(true)
    const query = encodeState(state(long), DEFAULT_MODEL)
    expect(query).not.toContain('customz=')
    expect(query).toContain('maxclouddeck=9000')
    // The link it does write reads back with nothing lost.
    expect(decodeLink(query, LIMITS).dropped).toEqual([])
  })

  it('is never true of a ready-made list or an empty box', () => {
    expect(customCsvTooLong(state(rows(1_400), PRESET_LISTS[0].id))).toBe(false)
    expect(customCsvTooLong(state(''))).toBe(false)
    expect(customCsvTooLong(state('  \n'))).toBe(false)
  })
})
