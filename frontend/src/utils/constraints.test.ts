import { describe, expect, it } from 'vitest'
import { AnalyzeRequest, DestinationResult } from '../types'
import {
  Constraints,
  NO_CONSTRAINTS,
  constraintFields,
  constraintsFromRequest,
  filterConstraints,
  hasConstraints,
  namesOnRequestMetric,
} from './constraints'
import { resultRow } from '../testSupport/fixtures'

// A request with no bounds on it, which the round trips below fill in.
const REQUEST: AnalyzeRequest = {
  destination_types: [],
  forecast_model: 'ecmwf_ifs025',
  start_datetime: '2026-07-21T00:00:00Z',
  end_datetime: '2026-07-21T02:00:00Z',
  limit: 2,
  sort_by: 'precip_total_in',
  sort_desc: false,
}

// ── filterConstraints: the port of _filter_constraints ─────────────────────

function bounded(over: Partial<Constraints>): Constraints {
  return { ...NO_CONSTRAINTS, ...over }
}

function boundRow(name: string, over: Partial<DestinationResult>): DestinationResult {
  return resultRow({ name, latitude: 1, longitude: 2, ...over })
}

describe('filterConstraints', () => {
  it('returns the rows untouched when nothing is bounded', () => {
    const rows = [boundRow('a', {}), boundRow('b', {})]
    expect(filterConstraints(rows, NO_CONSTRAINTS)).toBe(rows)
  })

  it('bounds precipitation on the window total, in both directions', () => {
    const rows = [
      boundRow('dry', { precip_total_in: 0 }),
      boundRow('damp', { precip_total_in: 0.1 }),
      boundRow('wet', { precip_total_in: 1 }),
    ]
    expect(
      filterConstraints(rows, bounded({ maxPrecipTotalIn: 0.5 })).map((r) => r.name),
    ).toEqual(['dry', 'damp'])
    expect(
      filterConstraints(rows, bounded({ minPrecipTotalIn: 0.05 })).map((r) => r.name),
    ).toEqual(['damp', 'wet'])
  })

  it('reads the hottest hour for a ceiling, not the average', () => {
    // The whole point of the bound. Both rows average 60°F; only one of them
    // is somewhere you would actually go under an 80°F ceiling.
    const rows = [
      boundRow('mild', { temp_min_f: 50, temp_max_f: 70, temp_avg_f: 60 }),
      boundRow('spiky', { temp_min_f: 40, temp_max_f: 95, temp_avg_f: 60 }),
    ]
    expect(filterConstraints(rows, bounded({ maxTempF: 80 })).map((r) => r.name)).toEqual([
      'mild',
    ])
  })

  it('reads the coldest hour for a floor', () => {
    const rows = [
      boundRow('mild', { temp_min_f: 50, temp_max_f: 70 }),
      boundRow('frosty', { temp_min_f: 15, temp_max_f: 80 }),
    ]
    expect(filterConstraints(rows, bounded({ minTempF: 20 })).map((r) => r.name)).toEqual([
      'mild',
    ])
  })

  it('reads the gustiest hour for a wind ceiling', () => {
    const rows = [
      boundRow('calm', { wind_min_mph: 2, wind_max_mph: 12, wind_avg_mph: 6 }),
      boundRow('gusty', { wind_min_mph: 1, wind_max_mph: 45, wind_avg_mph: 6 }),
    ]
    expect(filterConstraints(rows, bounded({ maxWindMph: 20 })).map((r) => r.name)).toEqual([
      'calm',
    ])
  })

  // Both ends read one field, and for a third reason: today\'s depth is a
  // single reading rather than a reduction over hours, so there is no best or
  // worst hour to choose between (#449).
  it('bounds snow depth on today\'s one number', () => {
    const rows = [
      boundRow('bare', { snow_depth_in: 0 }),
      boundRow('deep', { snow_depth_in: 42 }),
    ]
    expect(filterConstraints(rows, bounded({ minSnowDepthIn: 12 })).map((r) => r.name)).toEqual([
      'deep',
    ])
    expect(filterConstraints(rows, bounded({ maxSnowDepthIn: 12 })).map((r) => r.name)).toEqual([
      'bare',
    ])
  })

  // A row outside the grid, or every row while the pod holds no grid. The
  // absence says where the destination is, not what is on the ground.
  it('passes a row with no snow depth through either bound', () => {
    const rows = [boundRow('outside', {}), boundRow('deep', { snow_depth_in: 42 })]
    expect(filterConstraints(rows, bounded({ minSnowDepthIn: 12 })).map((r) => r.name)).toEqual([
      'outside',
      'deep',
    ])
    expect(filterConstraints(rows, bounded({ maxSnowDepthIn: 12 })).map((r) => r.name)).toEqual([
      'outside',
    ])
  })

  it('bounds air quality on its worst hour', () => {
    const rows = [
      boundRow('clean', { aqi_avg: 20, aqi_max: 30 }),
      boundRow('smoky', { aqi_avg: 60, aqi_max: 140 }),
    ]
    expect(filterConstraints(rows, bounded({ maxAqi: 100 })).map((r) => r.name)).toEqual([
      'clean',
    ])
    expect(filterConstraints(rows, bounded({ minAqi: 100 })).map((r) => r.name)).toEqual([
      'smoky',
    ])
  })

  // Neither end of this family is the bad one, so the bound is read straight:
  // the floor asks that the level never dropped below the value, the ceiling
  // that it never rose above it.
  it('bounds the freezing level on the window low and the window high', () => {
    const rows = [
      boundRow('high', { freeze_min_ft: 9000, freeze_max_ft: 11000 }),
      boundRow('low', { freeze_min_ft: 2000, freeze_max_ft: 4000 }),
    ]
    expect(filterConstraints(rows, bounded({ minFreezeFt: 8000 })).map((r) => r.name)).toEqual([
      'high',
    ])
    expect(filterConstraints(rows, bounded({ maxFreezeFt: 5000 })).map((r) => r.name)).toEqual([
      'low',
    ])
  })

  it('lets a null freezing level through either bound', () => {
    // Five of the eight models publish none at all, so dropping these rows
    // would empty the table outright for anyone who set the bound under one
    // of them — a statement about the model, never about the weather.
    const rows = [
      boundRow('unknown', { freeze_min_ft: null, freeze_max_ft: null }),
      boundRow('low', { freeze_min_ft: 2000, freeze_max_ft: 4000 }),
    ]
    expect(filterConstraints(rows, bounded({ minFreezeFt: 8000 })).map((r) => r.name)).toEqual([
      'unknown',
    ])
    expect(filterConstraints(rows, bounded({ maxFreezeFt: 5000 })).map((r) => r.name)).toEqual([
      'unknown',
      'low',
    ])
  })

  it('lets a null air quality through either bound', () => {
    // Past the ~5-day horizon there is no air quality at all, and an absent
    // number is not evidence of bad air. Dropping these rows would empty a
    // long-window analysis the moment a ceiling was set.
    const rows = [
      boundRow('unknown', { aqi_avg: null, aqi_max: null }),
      boundRow('smoky', { aqi_avg: 60, aqi_max: 140 }),
    ]
    expect(filterConstraints(rows, bounded({ maxAqi: 100 })).map((r) => r.name)).toEqual([
      'unknown',
    ])
    expect(filterConstraints(rows, bounded({ minAqi: 100 })).map((r) => r.name)).toEqual([
      'unknown',
      'smoky',
    ])
  })

  it('combines every bound as an AND', () => {
    const rows = [
      boundRow('keeper', { precip_total_in: 0, temp_max_f: 70, wind_max_mph: 10, aqi_max: 40 }),
      boundRow('wet', { precip_total_in: 2, temp_max_f: 70, wind_max_mph: 10, aqi_max: 40 }),
      boundRow('hot', { precip_total_in: 0, temp_max_f: 99, wind_max_mph: 10, aqi_max: 40 }),
      boundRow('windy', { precip_total_in: 0, temp_max_f: 70, wind_max_mph: 50, aqi_max: 40 }),
      boundRow('smoky', { precip_total_in: 0, temp_max_f: 70, wind_max_mph: 10, aqi_max: 180 }),
    ]
    const kept = filterConstraints(
      rows,
      bounded({ maxPrecipTotalIn: 0.5, maxTempF: 80, maxWindMph: 20, maxAqi: 100 }),
    )
    expect(kept.map((r) => r.name)).toEqual(['keeper'])
  })

  it('keeps nothing when a range is inverted', () => {
    // The panel applies bounds live, so a pair inverted mid-edit keeps nothing
    // rather than raising. The API refuses the same pair at the door (#563).
    const rows = [boundRow('a', { temp_min_f: 50, temp_max_f: 70 })]
    expect(filterConstraints(rows, bounded({ minTempF: 90, maxTempF: 10 }))).toEqual([])
  })
})

describe('constraint round trips', () => {
  it('carries every bound out to the wire fields and back', () => {
    const c = bounded({
      maxPrecipTotalIn: 0.1,
      minTempF: 20,
      maxWindMph: 20,
      minFreezeFt: 6000,
      maxFreezeFt: 12000,
      maxAqi: 100,
      minCloudDeckFt: 5000,
      maxCloudDeckFt: 20000,
    })
    expect(constraintsFromRequest({ ...REQUEST, ...constraintFields(c) })).toEqual(c)
  })

  it('reads an unbounded request as no bounds at all', () => {
    expect(constraintsFromRequest(REQUEST)).toEqual(NO_CONSTRAINTS)
    expect(hasConstraints(NO_CONSTRAINTS)).toBe(false)
    expect(hasConstraints(bounded({ maxAqi: 100 }))).toBe(true)
  })
})

describe('namesOnRequestMetric', () => {
  it('answers yes for a cloud ranking', () => {
    expect(namesOnRequestMetric('cloud_deck_min_ft', NO_CONSTRAINTS)).toBe(true)
    expect(namesOnRequestMetric('cloud_deck_avg_ft', NO_CONSTRAINTS)).toBe(true)
  })

  it('answers yes for a cloud bound under any ranking', () => {
    expect(namesOnRequestMetric('precip_total_in', { ...NO_CONSTRAINTS, minCloudDeckFt: 6000 })).toBe(true)
    expect(namesOnRequestMetric('aqi_avg', { ...NO_CONSTRAINTS, maxCloudDeckFt: 9000 })).toBe(true)
  })

  it('answers no when nothing names a cloud metric', () => {
    expect(namesOnRequestMetric('precip_total_in', NO_CONSTRAINTS)).toBe(false)
    expect(namesOnRequestMetric('freeze_min_ft', { ...NO_CONSTRAINTS, maxWindMph: 20 })).toBe(false)
  })
})

// The cloud bounds read the window's extremes like the wind's, and a row the
// report never fetched clouds for carries nulls, which pass (#117, #670).
describe('filterConstraints on the cloud bounds', () => {
  const low = resultRow({ name: 'Low', cloud_deck_min_ft: 3000, cloud_deck_max_ft: 9000 })
  const high = resultRow({ name: 'High', cloud_deck_min_ft: 8000, cloud_deck_max_ft: 30066 })
  const none = resultRow({ name: 'None' })
  const names = (rows: readonly DestinationResult[]) => rows.map((r) => r.name)

  it('keeps a deck floor to the rows whose lowest deck clears it', () => {
    expect(names(filterConstraints([low, high, none], { ...NO_CONSTRAINTS, minCloudDeckFt: 6000 }))).toEqual(['High', 'None'])
  })

  it('keeps a deck ceiling to the rows whose highest deck stays under it', () => {
    expect(names(filterConstraints([low, high, none], { ...NO_CONSTRAINTS, maxCloudDeckFt: 10000 }))).toEqual(['Low', 'None'])
  })
})
