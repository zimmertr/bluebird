import { describe, expect, it } from 'vitest'
import {
  AQI_LIMIT_DAYS,
  type BandLimits,
  FUTURE_LIMIT_DAYS,
  aqiHorizon,
  bandEnd,
  bandStart,
  inBand,
} from './calendarBand'
import { addDays, dayKey, monthKey } from './calendarDates'
import { monthGrid, monthHasBandDay } from './calendarGrid'

// Local noon on a Wednesday in July, well inside the servable band. Every
// horizon assertion below is measured from here.
const NOW = new Date(2026, 6, 15, 12, 0)

// A reach long enough that the API's hard date edge binds before any model's
// does, so these assertions test the edge they mean to. 384 h is what GFS
// measured; ECMWF's floor is 336. HRRR's 42 is the interesting opposite and
// gets its own describe block below.
//
// The near edge and the air-quality horizon ride in the same object (#123,
// #393). Both are what `/api/capabilities` publishes rather than measured API
// edges, and the fallbacks the hook compiles are the values used here.
const ARCHIVE_DAYS = 365
const LONG: BandLimits = {
  forecastHours: 384,
  pastDays: ARCHIVE_DAYS,
  aqiDays: AQI_LIMIT_DAYS,
}

const HRRR: BandLimits = { ...LONG, forecastHours: 42 }

describe('the servable band', () => {
  it('runs back exactly the published archive reach', () => {
    expect(bandStart(NOW, LONG)).toBe('2025-07-15')
    expect(addDays(dayKey(NOW), -ARCHIVE_DAYS)).toBe(bandStart(NOW, LONG))
  })

  // The far edge is one day short of the nominal offset here, and that is the
  // point: the request carries UTC dates, and 23:59 Pacific on the 30th is 06:59
  // UTC on the 31st — one day past what the API accepts, so the whole batch 400s.
  // In a zone at or east of Greenwich the same call returns today + 15, which is
  // why this is walked rather than subtracted. (vitest.config.ts pins Pacific.)
  it('stops at the last local day the API will serve the whole of', () => {
    const nominal = addDays(dayKey(NOW), FUTURE_LIMIT_DAYS)

    expect(nominal).toBe('2026-07-30')
    expect(bandEnd(NOW, LONG)).toBe('2026-07-29')
    // And the last minute it offers really does fall inside the API's UTC limit.
    const limit = new Date(NOW.getTime() + FUTURE_LIMIT_DAYS * 86_400_000)
    expect(new Date(`${bandEnd(NOW, LONG)}T23:59`).toISOString().slice(0, 10)).toBe(
      limit.toISOString().slice(0, 10),
    )
  })

  // Probed against the live forecast endpoint on 2026-07-31, which answered every
  // out-of-range request with a 400 naming its own limits:
  //
  //   today - 93 -> 200 (24 values)     today - 94 -> 400
  //   today + 15 -> 200 (24 values)     today + 16 -> 400
  //
  // So the far edge is exactly what the band offers. Re-probe before moving it.
  it('offers a far edge the weather service will actually serve', () => {
    expect(FUTURE_LIMIT_DAYS).toBe(15)
  })

  // The near edge is not a measured API edge at all any more (#123). Past the
  // forecast endpoint's own retention the archive answers, and it holds decades,
  // so what bounds this is a deployment choice about how far a calendar should
  // page — which is why it arrives from /api/capabilities rather than being
  // compiled here. The rule it still has to obey: every day it offers comes back
  // with data, which is what #230 closed and this must not reopen.
  it('takes its near edge from the band it is given', () => {
    expect(bandStart(NOW, { ...LONG, pastDays: 55 })).toBe('2026-05-21')
    expect(bandStart(NOW, { ...LONG, pastDays: 30 })).toBe('2026-06-15')
  })

  // Exactness at the edges was untested before the calendar, and the calendar is
  // what makes it visible: these are the first and last cells a user can click.
  it('admits both boundary days and refuses the days beyond them', () => {
    expect(inBand(bandStart(NOW, LONG), NOW, LONG)).toBe(true)
    expect(inBand(addDays(bandStart(NOW, LONG), -1), NOW, LONG)).toBe(false)
    expect(inBand(bandEnd(NOW, LONG), NOW, LONG)).toBe(true)
    expect(inBand(addDays(bandEnd(NOW, LONG), 1), NOW, LONG)).toBe(false)
  })

  // The archive's days are ordinary days (#123): it holds every hour of them,
  // and air quality reaches back over them too, so nothing about a day 200 days
  // back is partial. The rule this protects is #230's — the calendar must not
  // offer a day that comes back empty — from the other direction.
  it('draws a day inside the archive range as fully servable', () => {
    const grid = monthGrid(monthKey(addDays(dayKey(NOW), -200)), NOW, LONG).flat()
    const cell = grid.find((c) => c.date === addDays(dayKey(NOW), -200))
    expect(cell?.availability).toBe('full')
    expect(cell?.past).toBe(true)
  })

  it('puts the air-quality horizon inside the weather one', () => {
    expect(aqiHorizon(NOW, AQI_LIMIT_DAYS)).toBe('2026-07-20')
    expect(addDays(dayKey(NOW), AQI_LIMIT_DAYS)).toBe(aqiHorizon(NOW, AQI_LIMIT_DAYS))
    expect(aqiHorizon(NOW, AQI_LIMIT_DAYS) < bandEnd(NOW, LONG)).toBe(true)
  })

  // The horizon is published (#393), so the grid has to dim by what the
  // deployment says rather than by a number compiled into this module.
  it('dims by the horizon the band carries, not a compiled one', () => {
    const shorter: BandLimits = { ...LONG, aqiDays: AQI_LIMIT_DAYS - 2 }
    expect(aqiHorizon(NOW, shorter.aqiDays)).toBe('2026-07-18')
    const at = (band: BandLimits, date: string) =>
      monthGrid('2026-07', NOW, band)
        .flat()
        .find((c) => c.date === date)?.availability
    expect(at(LONG, '2026-07-19')).toBe('full')
    expect(at(shorter, '2026-07-19')).toBe('partial')
  })
})

// The far edge is the nearer of two limits and only one of them is per model.
// These pin which one binds, because getting it backwards is invisible: the
// calendar still draws a band, just the wrong one.
describe('the servable band under a short-range model', () => {
  // NOW is local noon on 2026-07-15, Pacific. HRRR's 42 h floor reaches
  // 2026-07-17T06:00 local, so the 17th is the last day it touches at all.
  it('ends on the day the model runs out, not the day the API stops accepting', () => {
    expect(bandEnd(NOW, HRRR)).toBe('2026-07-17')
    // Twelve days nearer than the same call under a global model.
    expect(bandEnd(NOW, LONG)).toBe('2026-07-29')
  })

  // The whole reason the reach is carried in hours. Rounded down to days the
  // model covers end to end, HRRR would offer today and nothing else in any
  // zone west of Greenwich, which for a model whose entire point is tomorrow
  // morning in the mountains is the same as not offering it.
  it('offers the day the reach lands in rather than the last whole day', () => {
    const grid = monthGrid('2026-07', NOW, HRRR).flat()
    const on = (date: string) => grid.find((c) => c.date === date)?.availability
    expect(on('2026-07-15')).toBe('full') // today, covered end to end
    expect(on('2026-07-16')).toBe('full') // tomorrow, covered end to end
    expect(on('2026-07-17')).toBe('partial') // the reach ends at 06:00
    expect(on('2026-07-18')).toBe('unservable')
  })

  // The near edge is retention, not forecast reach, so it does not move.
  it('leaves the past edge alone', () => {
    expect(bandStart(NOW, HRRR)).toBe(bandStart(NOW, LONG))
    expect(inBand('2026-06-01', NOW, HRRR)).toBe(true)
    expect(inBand('2026-06-01', NOW, LONG)).toBe(true)
  })

  it('bounds the month navigation by the model, not by the API', () => {
    expect(monthHasBandDay('2026-08', NOW, LONG)).toBe(false)
    expect(monthHasBandDay('2026-07', NOW, HRRR)).toBe(true)
  })
})
