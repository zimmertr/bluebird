import { describe, expect, it } from 'vitest'
import { resultRow, series } from '../../testSupport/fixtures'
import { CLOUD_DECK_CEILING_FT } from '../openMeteoAggregate'
import { scoreRow, scoreRows } from './windowScore'

// Mount Rainier in July: the sun is up from about 12:30 to 04:00 UTC.
const H = 3_600_000
const START = Date.UTC(2026, 6, 10, 0)
const HOURS = 48
const times = Array.from({ length: HOURS }, (_, i) => START + i * H)
const hourUtc = (i: number) => new Date(times[i]).getUTCHours()

function row(perfect: (i: number) => boolean, elevation = 14_000) {
  const ceiling = CLOUD_DECK_CEILING_FT
  return resultRow({
    elevation_ft: elevation,
    series: series({
      temp_f: times.map(() => 50),
      wind_mph: times.map((_, i) => (perfect(i) ? 5 : 35)),
      precip_in: times.map(() => 0),
      aqi: times.map(() => 20),
      snowfall_in: times.map(() => 0),
      cloud_deck_ft: times.map(() => ceiling),
      cloud_top_ft: times.map(() => ceiling),
    }),
  })
}

describe('scoreRow', () => {
  it('scores a calm, clear, dry window near 100', () => {
    const out = scoreRow(row(() => true), times, 'bluebird')
    expect(out.score).toBe(100)
  })

  it('finds the best four daylight hours of one day', () => {
    // Calm only from 18:00 to 22:00 UTC on the second day, windy otherwise.
    const out = scoreRow(row((i) => i >= 42 && i < 46), times, 'bluebird')
    expect(out.bestStartMs).toBe(times[42])
    expect(out.bestEndMs).toBe(times[45] + H)
    expect(out.score).not.toBeNull()
  })

  it('leaves the night out of the score', () => {
    // Calm all night and windy all day scores as the windy day it is.
    const nightCalm = scoreRow(row((i) => hourUtc(i) >= 5 && hourUtc(i) < 12), times, 'bluebird')
    const allWindy = scoreRow(row(() => false), times, 'bluebird')
    expect(nightCalm.score).toBe(allWindy.score)
    expect(nightCalm.lit.filter(Boolean).length).toBeGreaterThan(20)
  })

  it('weighs the best run three to one over the daylight mean', () => {
    const out = scoreRow(row((i) => i >= 42 && i < 46), times, 'bluebird')
    const lit = out.hours.filter((h, i): h is number => h != null && out.lit[i])
    const mean = lit.reduce((a, b) => a + b, 0) / lit.length
    expect(out.score).toBe(Math.round(0.75 * 100 + 0.25 * mean))
  })

  it('reads a summit inside the cloud as a bad sky', () => {
    const r = row(() => true)
    r.series = { ...r.series!, cloud_deck_ft: times.map(() => 12_000), cloud_top_ft: times.map(() => 16_000) }
    expect(scoreRow(r, times, 'bluebird').score).toBeLessThan(40)
  })

  it('answers null for a row with no forecast', () => {
    expect(scoreRow(resultRow({ series: undefined }), times, 'bluebird').score).toBeNull()
  })

  it('scores a night-only window on every hour rather than none', () => {
    const night = times.filter((t) => new Date(t).getUTCHours() >= 6 && new Date(t).getUTCHours() < 11).slice(0, 4)
    const r = row(() => true)
    const out = scoreRow({ ...r, series_times: night }, night, 'bluebird')
    expect(out.score).toBe(100)
  })
})

// The markers read a lens's hours during playback, so a scored row carries
// them beside its window score.
describe('scoreRows', () => {
  it('lays each row’s score, best stretch and hours on a copy of it', () => {
    const r = row(() => true)
    const [out] = scoreRows([r], times, 'bluebird')
    const direct = scoreRow(r, times, 'bluebird')
    expect(out).not.toBe(r)
    expect(out.score).toBe(direct.score)
    expect(out.best_start_ms).toBe(direct.bestStartMs)
    expect(out.score_hours).toEqual(direct.hours)
  })
})
