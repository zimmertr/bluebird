import { describe, expect, it } from 'vitest'
import { WHEN_ARM_LABEL, controlsSummary } from './controlsSummary'
import { forecastModel } from '../testSupport/fixtures'
import calendarSource from '../components/ForecastCalendar.tsx?raw'

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
