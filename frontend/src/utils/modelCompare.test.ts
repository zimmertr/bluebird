import { describe, it, expect } from 'vitest'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import { normalizeWindow } from './forecastWindow'
import { callWeight } from './openMeteo'
import { CHART_DASHES } from '../styles'
import {
  CompareDestination,
  CompareModel,
  compareAdded,
  compareDashes,
  compareEndMs,
  compareSeries,
  isBlend,
  modelSeriesOnGrid,
  pairKey,
} from './modelCompare'

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
  it('stops at the shortest reach among the models on the chart', () => {
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

describe('compareDashes', () => {
  it('gives each model on the chart its own line style', () => {
    const dashes = compareDashes(['gfs_seamless', 'gfs_hrrr', 'ecmwf_ifs025'])
    expect(new Set(Object.values(dashes)).size).toBe(3)
  })

  // The report's own lines are the plain ones, so the model that ranked the
  // field takes the solid entry.
  it('draws the ranking model solid', () => {
    expect(compareDashes(['gfs_seamless', 'gfs_hrrr']).gfs_seamless).toBe('')
    expect(compareDashes(['gfs_seamless', 'gfs_hrrr']).gfs_hrrr).not.toBe('')
  })

  // Tick order, so a model keeps its pattern as others are ticked on and off
  // around it.
  it('keeps a model’s pattern when another is added after it', () => {
    const before = compareDashes(['gfs_seamless', 'gfs_hrrr'])
    const after = compareDashes(['gfs_seamless', 'gfs_hrrr', 'ecmwf_ifs025'])
    expect(after.gfs_seamless).toBe(before.gfs_seamless)
    expect(after.gfs_hrrr).toBe(before.gfs_hrrr)
  })

  // No cap, so the table has to answer for more models than it holds. Cycling
  // repeats a pattern rather than leaving a line with none, and the hover box's
  // label is what separates the two.
  it('cycles the table rather than running out', () => {
    const many = Array.from({ length: CHART_DASHES.length + 2 }, (_, i) => `m${i}`)
    const dashes = compareDashes(many)
    expect(Object.keys(dashes)).toHaveLength(many.length)
    expect(dashes[`m${CHART_DASHES.length}`]).toBe(dashes.m0)
    expect(dashes[`m${CHART_DASHES.length + 1}`]).toBe(dashes.m1)
  })

  it('is stable for the same models in the same order', () => {
    expect(compareDashes(['a', 'b'])).toEqual(compareDashes(['a', 'b']))
  })
})

describe('modelSeriesOnGrid', () => {
  const fetched = {
    times: [2000, 3000],
    precip_in: [0.1, 0.2],
    temp_f: [30, 31],
    wind_mph: [5, 6],
  }

  it('re-indexes a clamped fetch onto the chart’s grid', () => {
    const series = modelSeriesOnGrid(fetched, [1000, 2000, 3000, 4000])!
    expect(series.precip_in).toEqual([null, 0.1, 0.2, null])
    expect(series.temp_f).toEqual([null, 30, 31, null])
    expect(series.wind_mph).toEqual([null, 5, 6, null])
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
  const TIMES = [1000, 2000, 3000]

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

  const ON_CHART: CompareModel[] = [
    { id: 'gfs_seamless', label: 'NOAA GFS', dash: '' },
    { id: 'gfs_hrrr', label: 'NOAA HRRR', dash: '6 4' },
    { id: 'ecmwf_ifs025', label: 'ECMWF IFS', dash: '1 4' },
  ]

  function series(values: number[]) {
    return {
      precip_in: values,
      temp_f: values,
      wind_mph: values,
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
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    expect(lines).toHaveLength(9)
    expect(new Set(lines.map((l) => l.key)).size).toBe(9)
  })

  // Rank, destination, model, on every entry including the ranking model's, so
  // a reader tells two lines apart by reading the same three things each time.
  it('names every line the same way', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    expect(lines[0].label).toBe('1. Mount Rainier (NOAA GFS)')
    expect(lines.map((l) => l.label)).toContain('1. Mount Rainier (ECMWF IFS)')
    expect(lines.map((l) => l.label)).toContain('3. Mount Adams (NOAA HRRR)')
  })

  // Two facts, two channels. Colour is the destination's — the hue it already
  // wears in the table and on the map — so the three lines of one destination
  // share a colour whichever model drew them.
  it('colours a line by its destination', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    for (const d of DESTINATIONS) {
      const mine = lines.filter((l) => l.label.includes(d.name))
      expect(mine).toHaveLength(3)
      for (const line of mine) expect(line.color).toBe(d.color)
    }
  })

  // And the line style is the model's, so the three lines of one model share a
  // pattern whichever destination they are.
  it('styles a line by its model', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    for (const m of ON_CHART) {
      const mine = lines.filter((l) => l.label.endsWith(`(${m.label})`))
      expect(mine).toHaveLength(3)
      for (const line of mine) expect(line.dash).toBe(m.dash)
    }
  })

  // The ranking model leads the list, and its entry is the solid one, so the
  // lines the report was built from read as the plain ones.
  it('leaves the ranking model’s lines solid', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    expect(lines.slice(0, 3).every((l) => l.dash === '')).toBe(true)
  })

  // The chips read ranking model first, and the lines leave in that order so
  // the key and the chart agree about which is which.
  it('leads with the ranking model’s lines', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    expect(lines.slice(0, 3).map((l) => l.label)).toEqual([
      '1. Mount Rainier (NOAA GFS)',
      '2. Mount Shuksan (NOAA GFS)',
      '3. Mount Adams (NOAA GFS)',
    ])
  })

  // No cap: every published model may be on the chart at once, which is what
  // the review asked for when it took the ceiling out.
  it('has no ceiling on the models it will draw', () => {
    const many: CompareModel[] = MODELS.map((m, i) => ({
      id: m.id,
      label: m.label,
      dash: CHART_DASHES[i],
    }))
    const held: Record<string, ReturnType<typeof series>> = {}
    for (const model of many) {
      for (const d of DESTINATIONS) held[pairKey(model.id, d.key)] = series([1, 2, 3])
    }
    expect(compareSeries(DESTINATIONS, many, held, TIMES, null)).toHaveLength(
      MODELS.length * DESTINATIONS.length,
    )
  })

  // A model with no data at one spot draws nothing there rather than a flat
  // line, and its companion's lines are untouched.
  it('skips a pair that came back with nothing', () => {
    const held = everyPair() as Record<string, ReturnType<typeof series> | null>
    held[pairKey('gfs_hrrr', DESTINATIONS[0].key)] = null
    delete held[pairKey('ecmwf_ifs025', DESTINATIONS[1].key)]
    const lines = compareSeries(DESTINATIONS, ON_CHART, held, TIMES, null)
    expect(lines).toHaveLength(7)
    expect(lines.map((l) => l.label)).not.toContain('1. Mount Rainier (NOAA HRRR)')
    expect(lines.map((l) => l.label)).toContain('1. Mount Rainier (ECMWF IFS)')
  })

  // Every line stops together or their shapes are not answers to one question.
  it('clamps every line to the shortest reach on the chart', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, 2000)
    for (const line of lines) expect(line.series!.precip_in).toEqual([1, 2, null])
  })

  // A destination's key is a coordinate pair, so a pair's key has to be
  // namespaced or a line could shadow one.
  it('keys a pair where no destination can', () => {
    const lines = compareSeries(DESTINATIONS, ON_CHART, everyPair(), TIMES, null)
    for (const line of lines) expect(line.key.startsWith('model:')).toBe(true)
  })

  it('draws nothing when no model is on the chart', () => {
    expect(compareSeries(DESTINATIONS, [], everyPair(), TIMES, null)).toEqual([])
  })
})
