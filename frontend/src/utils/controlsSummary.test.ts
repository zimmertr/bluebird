import { describe, expect, it } from 'vitest'
import { WHEN_ARM_LABEL, controlsSummary, destinationsSummary, metricsSummary } from './controlsSummary'
import { forecastModel } from '../testSupport/fixtures'
import calendarSource from '../components/ForecastCalendar.tsx?raw'
import metricsTableSource from '../components/MetricsTable.tsx?raw'

const MODELS = [forecastModel(), forecastModel({ id: 'ukmo_seamless', label: 'UK Met Office' })]

describe('controlsSummary', () => {
  // The two words the panel already shows, joined by the approved middle dot.
  it('names the live When arm and the model that ranks', () => {
    expect(controlsSummary('now', MODELS, 'gfs_seamless')).toBe('Current · NOAA GFS')
    expect(controlsSummary('days', MODELS, 'ukmo_seamless')).toBe('Dates · UK Met Office')
  })

  // A link can name a model this deployment stopped publishing, and the
  // panel's own sentences fall back to the id for it; so does this.
  it('falls back to the id for a model the deployment does not publish', () => {
    expect(controlsSummary('now', MODELS, 'gone_model')).toBe('Current · gone_model')
  })

  // One spelling of each arm's word: the calendar's segment reads it rather
  // than typing it again, so a rename reaches the summary too.
  it('is the word the calendar\'s segment draws', () => {
    expect(WHEN_ARM_LABEL).toEqual({ now: 'Current', days: 'Dates' })
    expect(calendarSource).toContain('label: WHEN_ARM_LABEL.now')
    expect(calendarSource).toContain('label: WHEN_ARM_LABEL.days')
    expect(calendarSource).not.toMatch(/label: '(Current|Dates)'/)
  })
})

// The lines a desk's card shows for a collapsed section (record 0305), in the
// words the maintainer approved on 2026-11-16.
describe('destinationsSummary', () => {
  const NONE = { ringPoints: 0, kinds: [], listName: null, pointDestinations: 0 }

  it('says None yet until the reader has named anything', () => {
    expect(destinationsSummary(NONE)).toBe('None yet')
    // Ticked kinds with no ring search nothing, so they name nothing.
    expect(destinationsSummary({ ...NONE, kinds: ['Peaks'] })).toBe('None yet')
  })

  it('reads a ring as its point count and the kinds it looks for', () => {
    expect(destinationsSummary({ ...NONE, ringPoints: 6, kinds: ['Peaks'] })).toBe('6 points · Peaks')
    expect(destinationsSummary({ ...NONE, ringPoints: 4, kinds: ['Peaks', 'Lakes'] })).toBe('4 points · Peaks, Lakes')
    expect(destinationsSummary({ ...NONE, ringPoints: 1, kinds: [] })).toBe('1 point')
  })

  it('reads a picked list as its own name', () => {
    expect(destinationsSummary({ ...NONE, listName: 'Washington Bulgers' })).toBe('Washington Bulgers')
  })

  it('counts every other point destination in one number', () => {
    expect(destinationsSummary({ ...NONE, pointDestinations: 12 })).toBe('12 destinations')
    expect(destinationsSummary({ ...NONE, pointDestinations: 1 })).toBe('1 destination')
  })

  it('joins what the reader named with the middle dot', () => {
    expect(
      destinationsSummary({ ringPoints: 6, kinds: ['Peaks'], listName: 'Washington Bulgers', pointDestinations: 2 }),
    ).toBe('6 points · Peaks · Washington Bulgers · 2 destinations')
  })
})

describe('metricsSummary', () => {
  it('names the metric that ranks, the direction and the rows shown', () => {
    expect(metricsSummary('aqi_max', 'Lowest', 200)).toBe('AQI · Lowest · 200')
    expect(metricsSummary('wind_max_mph', 'Highest', 50)).toBe('Wind · Highest · 50')
  })

  // The direction is the word the segment's half shows: the section hands
  // it its own, so there is one spelling.
  it('is handed the direction by the section that draws it', () => {
    expect(metricsTableSource).toContain('DIRECTIONS.find((d) => d.desc === sortDesc)!.label')
    expect(metricsTableSource.match(/label: 'Lowest'/g)).toHaveLength(1)
    expect(metricsTableSource.match(/label: 'Highest'/g)).toHaveLength(1)
  })
})
