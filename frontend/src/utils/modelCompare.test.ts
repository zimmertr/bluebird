import { describe, it, expect } from 'vitest'
import type { DestinationResult } from '../types'
import type { WeatherResult } from './openMeteo'
import type { WeatherAggregates } from './openMeteoAggregate'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import { allocateColors } from './chartColors'
import { normalizeWindow } from './forecastWindow'
import { callWeight } from './openMeteo'
import {
  CompareDestination,
  CompareModel,
  compareAdded,
  compareEndMs,
  compareSeries,
  isBlend,
  isPartialRow,
  modelEndLines,
  modelRowsFor,
  PARTIAL_COVERAGE_NOTE,
  partialModels,
  modelSeriesOnGrid,
  pairColor,
  pairKey,
} from './modelCompare'
import { resultRow, weatherResult } from '../testSupport/fixtures'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 8, 12, 12, 0)

function model(id: string, forecastHours: number, blend = false): ForecastModelOption {
  return {
    id,
    label: id.toUpperCase(),
    summary: '',
    finestGridKm: 3,
    forecastHours,
    regional: false,
    blend,
  }
}

const MODELS: ForecastModelOption[] = [
  model('gfs_seamless', 384, true),
  model('ecmwf_ifs025', 336),
  model('gfs_hrrr', 42),
  model('meteofrance_seamless', 72, true),
]

// The cost of a comparison, in the unit every capacity number in this app is
// written in. The issue's own table said three models were free; it assumed
// three hourly variables and the browser sends nine, so the floor of the
// variable factor stops covering a second model.
describe('what a comparison costs', () => {
  const start = Date.UTC(2026, 8, 12, 0, 0)
  const end = Date.UTC(2026, 8, 13, 0, 0)

  it('prices models in one request at variables x models / 10', () => {
    expect(callWeight(1, start, end, 9, 1)).toBeCloseTo(1.0, 6)
    expect(callWeight(1, start, end, 9, 2)).toBeCloseTo(1.8, 6)
    expect(callWeight(1, start, end, 9, 3)).toBeCloseTo(2.7, 6)
  })

  // What the app actually spends: the analysis model's numbers are held, so a
  // three-model comparison buys two model series, as one single-model request
  // each. The premium over asking for both in one request is 0.2 weighted
  // calls, and it buys a per-model coverage answer a bare-keyed multi-model
  // response cannot give.
  it('spends two single-model requests for a three-model comparison', () => {
    const split = 2 * callWeight(1, start, end, 9, 1)
    expect(split).toBeCloseTo(2.0, 6)
    expect(split - callWeight(1, start, end, 9, 2)).toBeCloseTo(0.2, 6)
  })

  it('scales with the window the way any other request does', () => {
    const long = Date.UTC(2026, 8, 27, 0, 0) // 16 days inclusive
    expect(callWeight(1, start, long, 9, 1)).toBeCloseTo(16 / 14, 6)
  })

  // No cap. The review took the three-model ceiling out: it hid the control
  // that set it, and the spend is already bounded by the Analyze click that
  // buys it rather than by a number here.
  it('prices a comparison of every published model', () => {
    const all = MODELS.length * callWeight(1, start, end, 9, 1)
    expect(all).toBeCloseTo(MODELS.length, 6)
  })
})

describe('isBlend', () => {
  it('reads the flag the server publishes', () => {
    expect(isBlend(MODELS, 'gfs_seamless')).toBe(true)
    expect(isBlend(MODELS, 'meteofrance_seamless')).toBe(true)
    expect(isBlend(MODELS, 'ecmwf_ifs025')).toBe(false)
    expect(isBlend(MODELS, 'gfs_hrrr')).toBe(false)
  })

  // The suffix is Open-Meteo's naming habit, not a contract: a blended model
  // under another name has to read as a blend, and a `_seamless` id the server
  // does not flag has to read as one model.
  it('does not read the id for a suffix', () => {
    expect(isBlend([model('acme_blend', 100, true)], 'acme_blend')).toBe(true)
    expect(isBlend([model('acme_seamless', 100)], 'acme_seamless')).toBe(false)
  })

  it('is not a blend when the server never published the model', () => {
    expect(isBlend(MODELS, 'something_retired')).toBe(false)
  })
})

describe('compareEndMs', () => {
  it('stops at the shortest reach among the models given', () => {
    const end = NOW + 10 * DAY
    expect(compareEndMs(end, [384, 42], NOW)).toBe(NOW + 42 * HOUR)
  })

  it('leaves a window every model covers alone', () => {
    const end = NOW + DAY
    expect(compareEndMs(end, [384, 42], NOW)).toBe(end)
  })

  // forecast_hours counts hours ahead of now, so history is not model-limited.
  it('leaves a window in the past alone', () => {
    const end = NOW - DAY
    expect(compareEndMs(end, [42], NOW)).toBe(end)
  })

  it('is the window itself when nothing is compared', () => {
    const end = NOW + 10 * DAY
    expect(compareEndMs(end, [], NOW)).toBe(end)
  })

  // The window the hook fetches for is this function over the resolved window,
  // so a Current analysis has to buy a span rather than a moment: Open-Meteo's
  // inclusive filter matches nothing between a moment and itself.
  it('asks for a span when the analysis was one hour', () => {
    const at = Date.UTC(2026, 8, 12, 18, 30)
    const resolved = normalizeWindow(at, at)
    expect(compareEndMs(resolved.endMs, [384], NOW)).toBeGreaterThan(resolved.startMs)
  })
})

describe('compareAdded', () => {
  it('is a change when the panel names a model the analysis never bought', () => {
    expect(compareAdded(['gfs_hrrr'], ['gfs_hrrr', 'ecmwf_ifs025'])).toBe(true)
  })

  // Unticking is pure re-presentation: the line is drawn from numbers already
  // held, so dropping it needs no Analyze and must not ask for one.
  it('is no change when the panel only dropped one', () => {
    expect(compareAdded(['gfs_hrrr', 'ecmwf_ifs025'], ['gfs_hrrr'])).toBe(false)
    expect(compareAdded(['gfs_hrrr'], [])).toBe(false)
  })

  it('is no change when nothing moved', () => {
    expect(compareAdded([], [])).toBe(false)
    expect(compareAdded(['gfs_hrrr'], ['gfs_hrrr'])).toBe(false)
  })

  // Unticking one and ticking another is still a purchase.
  it('is a change when a swap brings in a model that was never bought', () => {
    expect(compareAdded(['gfs_hrrr'], ['ecmwf_ifs025'])).toBe(true)
  })
})

describe('modelSeriesOnGrid', () => {
  const fetched = {
    times: [2000, 3000],
    precip_in: [0.1, 0.2],
    temp_f: [30, 31],
    wind_mph: [5, 6],
    freeze_ft: [8000, 8100],
  }

  it('re-indexes a clamped fetch onto the chart’s grid', () => {
    const series = modelSeriesOnGrid(fetched, [1000, 2000, 3000, 4000])!
    expect(series.precip_in).toEqual([null, 0.1, 0.2, null])
    expect(series.temp_f).toEqual([null, 30, 31, null])
    expect(series.wind_mph).toEqual([null, 5, 6, null])
    expect(series.freeze_ft).toEqual([null, 8000, 8100, null])
  })

  // Air quality has one model, so there is no second answer to draw.
  it('carries no air quality', () => {
    expect(modelSeriesOnGrid(fetched, [2000, 3000])!.aqi).toEqual([null, null])
  })

  it('has nothing to draw for a model that answered with nothing', () => {
    expect(modelSeriesOnGrid(null, [1000])).toBeNull()
  })
})

describe('compareSeries', () => {
  function destination(
    key: string,
    rank: number,
    name: string,
    color: string,
  ): CompareDestination {
    return { key, rank, name, color, latitude: 46, longitude: -121, elevationFt: 14_000 }
  }

  const DESTINATIONS = [
    destination('46.85,-121.76', 1, 'Mount Rainier', '#aaaaaa'),
    destination('48.78,-121.11', 2, 'Mount Shuksan', '#bbbbbb'),
    destination('46.2,-121.49', 3, 'Mount Adams', '#cccccc'),
  ]

  // The ranking model leads; a model carries no colour, because a colour
  // belongs to a LINE and a model draws one per destination.
  const ON_CHART: CompareModel[] = [
    { id: 'gfs_seamless', label: 'NOAA GFS' },
    { id: 'gfs_hrrr', label: 'NOAA HRRR' },
    { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
  ]
  const RANKING = 'gfs_seamless'

  // The colour map the chart hands in: the ranking model's pairs seeded with
  // their destinations' own colours, every other pair allocated off the one
  // session allocator past them.
  function pairColors(models: readonly CompareModel[] = ON_CHART) {
    const seeded: Record<string, string> = {}
    for (const d of DESTINATIONS) seeded[pairKey(RANKING, d.key)] = d.color
    const keys = models
      .filter((m) => m.id !== RANKING)
      .flatMap((m) => DESTINATIONS.map((d) => pairKey(m.id, d.key)))
    return { ...allocateColors(seeded, keys), ...seeded }
  }

  function series(values: (number | null)[]) {
    return {
      precip_in: values,
      temp_f: values,
      wind_mph: values,
      freeze_ft: values,
      aqi: values.map(() => null),
    }
  }

  // Every pair, so three destinations under three models is nine lines rather
  // than the one destination the review found.
  function everyPair() {
    const held: Record<string, ReturnType<typeof series>> = {}
    for (const model of ON_CHART) {
      for (const d of DESTINATIONS) held[pairKey(model.id, d.key)] = series([1, 2, 3])
    }
    return held
  }

  it('draws one line per destination and model', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    expect(lines).toHaveLength(9)
    expect(new Set(lines.map((l) => l.key)).size).toBe(9)
  })

  // Rank, destination, model, on every entry including the ranking model's, so
  // a reader tells two lines apart by reading the same three things each time.
  it('names every line the same way', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    expect(lines[0].label).toBe('1. Mount Rainier (NOAA GFS)')
    expect(lines.map((l) => l.label)).toContain('1. Mount Rainier (ECMWF IFS)')
    expect(lines.map((l) => l.label)).toContain('3. Mount Adams (NOAA HRRR)')
  })

  // The ranking model's lines are the ones the chart always drew, so each
  // wears its own destination's colour — the hue the marker and the table
  // checkbox already give it — and a chart with nothing compared is unchanged.
  it('colours the ranking model’s lines by destination', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    for (const d of DESTINATIONS) {
      const mine = lines.filter((l) => l.label === `${d.rank}. ${d.name} (NOAA GFS)`)
      expect(mine).toHaveLength(1)
      expect(mine[0].color).toBe(d.color)
    }
  })

  // Every line has a colour of ITS OWN: three destinations under three models
  // is nine lines and nine colours, so no two lines on the chart can be
  // mistaken for each other.
  it('gives every destination-and-model pair its own colour', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    expect(lines).toHaveLength(DESTINATIONS.length * ON_CHART.length)
    expect(new Set(lines.map((l) => l.color)).size).toBe(lines.length)
  })

  // A compared model's lines are told apart from each other the way any two
  // lines are: by colour and by the name in the hover box.
  it('gives one model’s lines different colours at different destinations', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    const mine = lines.filter((l) => l.label.endsWith('(NOAA HRRR)'))
    expect(mine).toHaveLength(3)
    expect(new Set(mine.map((l) => l.color)).size).toBe(3)
  })

  // A pair keeps the colour it was given when other pairs come and go, which
  // is what the session allocator is for.
  it('keeps a pair’s colour when another model joins the chart', () => {
    const two = ON_CHART.slice(0, 2)
    const before = compareSeries(DESTINATIONS, two, everyPair(), pairColors(two))
    const after = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    for (const line of before) {
      const same = after.find((l) => l.key === line.key)
      expect(same?.color, line.label).toBe(line.color)
    }
  })

  // Every line is solid now: colour is the only channel, so nothing here may
  // grow a second one back.
  it('gives no line a style of its own', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    for (const line of lines) expect('dash' in line).toBe(false)
  })

  // The chips read ranking model first, and the lines leave in that order so
  // the key and the chart agree about which is which.
  it('leads with the ranking model’s lines', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    expect(lines.slice(0, 3).map((l) => l.label)).toEqual([
      '1. Mount Rainier (NOAA GFS)',
      '2. Mount Shuksan (NOAA GFS)',
      '3. Mount Adams (NOAA GFS)',
    ])
  })

  // No cap: every published model may be on the chart at once, which is what
  // the review asked for when it took the ceiling out.
  it('has no ceiling on the models it will draw', () => {
    const many: CompareModel[] = MODELS.map((m) => ({ id: m.id, label: m.label }))
    const held: Record<string, ReturnType<typeof series>> = {}
    for (const model of many) {
      for (const d of DESTINATIONS) held[pairKey(model.id, d.key)] = series([1, 2, 3])
    }
    expect(compareSeries(DESTINATIONS, many, held, pairColors(many))).toHaveLength(
      MODELS.length * DESTINATIONS.length,
    )
  })

  // A model with no data at one spot draws nothing there rather than a flat
  // line, and its companion's lines are untouched.
  it('skips a pair that came back with nothing', () => {
    const held = everyPair() as Record<string, ReturnType<typeof series> | null>
    held[pairKey('gfs_hrrr', DESTINATIONS[0].key)] = null
    delete held[pairKey('ecmwf_ifs025', DESTINATIONS[1].key)]
    const lines = compareSeries(DESTINATIONS, ON_CHART, held, pairColors())
    expect(lines).toHaveLength(7)
    expect(lines.map((l) => l.label)).not.toContain('1. Mount Rainier (NOAA HRRR)')
    expect(lines.map((l) => l.label)).toContain('1. Mount Rainier (ECMWF IFS)')
  })

  // Each line runs to its own model's reach (#493): the chart marks where a
  // shorter model ends rather than cutting the longer models' hours to match.
  it('cuts no line to another model reach', () => {
    const held = everyPair() as Record<string, ReturnType<typeof series> | null>
    held[pairKey('gfs_hrrr', DESTINATIONS[0].key)] = series([1, null, null])
    const lines = compareSeries(DESTINATIONS, ON_CHART, held, pairColors())
    const byLabel = new Map(lines.map((l) => [l.label, l.series!.precip_in]))
    expect(byLabel.get('1. Mount Rainier (NOAA HRRR)')).toEqual([1, null, null])
    expect(byLabel.get('1. Mount Rainier (NOAA GFS)')).toEqual([1, 2, 3])
  })

  // A destination's key is a coordinate pair, so a pair's key has to be
  // namespaced or a line could shadow one.
  it('keys a pair where no destination can', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), pairColors())
    for (const line of lines) expect(line.key.startsWith('model:')).toBe(true)
  })

  it('draws nothing when no model is on the chart', () => {
    expect(compareSeries(DESTINATIONS, [], everyPair(), pairColors())).toEqual([])
  })

})

describe('one table row per model', () => {
  const ROW = resultRow({
    name: 'East Tiger Mountain',
    latitude: 47.44,
    longitude: -121.93,
    elevation_ft: 3004,
    osm_id: 'node/1',
    precip_total_in: 0.5,
    precip_avg_in_hr: 0.1,
    precip_max_in_hr: 0.2,
    temp_min_f: 40,
    temp_max_f: 60,
    temp_avg_f: 50,
    wind_min_mph: 2,
    wind_max_mph: 9,
    wind_avg_mph: 5,
    freeze_min_ft: 7000,
    freeze_max_ft: 9000,
    freeze_avg_ft: 8000,
    aqi_avg: 21,
    aqi_min: 12,
    aqi_max: 30,
  })
  const MODELS = [
    { id: 'gfs_seamless', label: 'NOAA GFS' },
    { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
  ]
  const keyOf = (r: DestinationResult) => `${r.latitude},${r.longitude}`

  // The compared model's answer. Its precipitation total and its top wind are
  // not ROW's, which is what lets an assertion tell a compared row from the
  // report's own.
  function answer(over: Partial<WeatherAggregates> = {}): WeatherResult {
    return weatherResult({
      precip_total_in: 1.5,
      precip_avg_in_hr: 0.3,
      precip_max_in_hr: 0.6,
      temp_min_f: 30,
      temp_max_f: 50,
      temp_avg_f: 40,
      wind_min_mph: 4,
      wind_max_mph: 18,
      wind_avg_mph: 10,
      ...over,
    })
  }

  it('gives one row per model, grouped by destination', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer({}) }
    const out = modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf)
    expect(out.map((r) => r.modelLabel)).toEqual(['NOAA GFS', 'ECMWF IFS'])
    expect(out.map((r) => r.name)).toEqual([ROW.name, ROW.name])
  })

  // The ranking model's row is the report's own. Re-deriving it from a second
  // fetch could only disagree with the ranking it already produced.
  it('takes the ranking model row from the report unchanged', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer({}) }
    const [ranked] = modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf)
    expect(ranked.precip_total_in).toBe(ROW.precip_total_in)
    expect(ranked.modelId).toBe('gfs_seamless')
  })

  it('takes a compared row weather from that model', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer({}) }
    const [, compared] = modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf)
    expect(compared.precip_total_in).toBe(1.5)
    expect(compared.wind_max_mph).toBe(18)
  })

  // The destination is the same place whichever model answered.
  it('keeps the destination identity on every row', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer({}) }
    for (const row of modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf)) {
      expect(row.name).toBe(ROW.name)
      expect(row.latitude).toBe(ROW.latitude)
      expect(row.elevation_ft).toBe(ROW.elevation_ft)
    }
  })

  // Air quality comes from one source whatever model ranks, so a compared row
  // carries the report's numbers rather than a blank.
  it('carries the same air quality on every row', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer({}) }
    for (const row of modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf)) {
      expect(row.aqi_avg).toBe(21)
      expect(row.aqi_max).toBe(30)
    }
  })

  // A model outside its domain has no numbers. A row of zeros there would read
  // as a forecast of calm, so it contributes no row at all.
  it('drops a pair nothing was fetched for', () => {
    const out = modelRowsFor([ROW], MODELS, 'gfs_seamless', {}, keyOf)
    expect(out.map((r) => r.modelId)).toEqual(['gfs_seamless'])
  })

  it('drops a pair that answered with nothing', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: null }
    const out = modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf)
    expect(out.map((r) => r.modelId)).toEqual(['gfs_seamless'])
  })

  // The number down the # column is the destination's, not the row's: eight
  // rows for one place counting off 1 to 8 would read as eight places.
  it('shares one rank across a destination model rows', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer() }
    const second = { ...ROW, name: 'Mount Si', latitude: 47.49, longitude: -121.72 }
    const held2 = { ...held, [pairKey('ecmwf_ifs025', keyOf(second))]: answer() }
    const out = modelRowsFor([ROW, second], MODELS, 'gfs_seamless', held2, keyOf)
    expect(out.map((r) => r.rank)).toEqual([1, 1, 2, 2])
  })

  it('leaves a single-model report one row per destination', () => {
    const out = modelRowsFor([ROW], MODELS.slice(0, 1), 'gfs_seamless', {}, keyOf)
    expect(out).toHaveLength(1)
  })

  // A model that ends inside the window says so on its own rows, and on no
  // other: the ranking model's row always covers the window.
  it('marks a compared row whose model ends inside the window', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer() }
    const ends = { ecmwf_ifs025: NOW + 42 * HOUR }
    const [ranked, compared] = modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf, ends)
    expect(compared.coverageEndMs).toBe(NOW + 42 * HOUR)
    expect(ranked.coverageEndMs).toBeUndefined()
  })

  it('leaves a compared row that covers the window unmarked', () => {
    const held = { [pairKey('ecmwf_ifs025', keyOf(ROW))]: answer() }
    const [, compared] = modelRowsFor([ROW], MODELS, 'gfs_seamless', held, keyOf, {})
    expect(compared).not.toHaveProperty('coverageEndMs')
  })
})

// Where a compared model's forecast ends inside the window (#493): the chart's
// dashed line, the Model cell's mark and the footnote, and the file's metadata rows.
describe('a model that ends early', () => {
  const HRRR = { id: 'gfs_hrrr', label: 'NOAA HRRR' }
  const IFS = { id: 'ecmwf_ifs025', label: 'ECMWF IFS' }
  const ICON = { id: 'icon_seamless', label: 'DWD ICON' }
  const short = (model: { id: string; label: string }, endMs: number) =>
    ({ ...resultRow(), modelId: model.id, modelLabel: model.label, rank: 1, coverageEndMs: endMs }) as DestinationResult
  const full = (model: { id: string; label: string }) =>
    ({ ...resultRow(), modelId: model.id, modelLabel: model.label, rank: 1 }) as DestinationResult

  describe('modelEndLines', () => {
    it('draws one line per model end', () => {
      expect(modelEndLines([{ label: 'NOAA HRRR', endMs: 1000 }])).toEqual([
        { endMs: 1000, label: 'NOAA HRRR' },
      ])
    })

    // Two lines on one instant would overprint their labels.
    it('shares one line between models with one end, naming both', () => {
      const lines = modelEndLines([
        { label: 'NOAA HRRR', endMs: 1000 },
        { label: 'ECMWF IFS', endMs: 2000 },
        { label: 'DWD ICON', endMs: 1000 },
      ])
      expect(lines).toEqual([
        { endMs: 1000, label: 'NOAA HRRR and DWD ICON' },
        { endMs: 2000, label: 'ECMWF IFS' },
      ])
    })

    it('draws nothing when no model ends early', () => {
      expect(modelEndLines([])).toEqual([])
    })
  })

  // Approved verbatim (#508). It names no model, because the Model cell does,
  // and it states the cause rather than the effect.
  it('says what the mark means in one fixed line', () => {
    expect(PARTIAL_COVERAGE_NOTE).toBe(
      "* Data is aggregated over a subset of the forecast window due to the model's limited range.",
    )
  })

  describe('partialModels', () => {
    // The picker's order, whatever order a detail sort put the rows in.
    it('lists the short models in the order given', () => {
      const rows = [short(ICON, 3000), full(IFS), short(HRRR, 1000)]
      expect(partialModels([HRRR, IFS, ICON], rows)).toEqual([
        { label: 'NOAA HRRR', endMs: 1000 },
        { label: 'DWD ICON', endMs: 3000 },
      ])
    })

    // A model with no row on display is named by neither the footnote nor
    // the file.
    it('names no model without a short row on display', () => {
      expect(partialModels([HRRR, IFS], [full(HRRR), full(IFS)])).toEqual([])
      expect(partialModels([HRRR], [])).toEqual([])
    })
  })

  // One mark per row, on the Model cell (#508), so the predicate reads the
  // row and never a column.
  describe('isPartialRow', () => {
    it('marks a row whose model ends inside the window', () => {
      expect(isPartialRow(short(HRRR, 1000))).toBe(true)
    })

    it('leaves a row that covers the window unmarked', () => {
      expect(isPartialRow(full(HRRR))).toBe(false)
      expect(isPartialRow(resultRow())).toBe(false)
    })
  })
})

// A colour identifies a LINE, and a line is a (destination, model) pair. The
// chart draws those lines and the table's chart checkbox stands beside the row
// that produces one, so both read this and neither indexes the map itself.
describe('the pair colour', () => {
  const COLORS = { 'ecmwf_ifs025|46.85,-121.76': '#00ff00' }

  it('gives a pair its own colour', () => {
    expect(pairColor(COLORS, 'ecmwf_ifs025', '46.85,-121.76', '#aaaaaa')).toBe('#00ff00')
  })

  // A report with one model selected, and the frame before the allocator runs.
  it('falls back to the destination colour with no pair colour', () => {
    expect(pairColor(COLORS, 'gfs_seamless', '46.85,-121.76', '#aaaaaa')).toBe('#aaaaaa')
    expect(pairColor(COLORS, undefined, '46.85,-121.76', '#aaaaaa')).toBe('#aaaaaa')
  })
})
