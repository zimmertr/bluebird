import { describe, expect, it } from 'vitest'
import { WHEN_ARM_LABEL } from './controlsSummary'
import calendarSource from '../components/ForecastCalendar.tsx?raw'

describe('WHEN_ARM_LABEL', () => {
  // One spelling of each arm's word: the calendar's segment reads it rather
  // than typing it again.
  it('is the word the calendar\'s segment draws', () => {
    expect(WHEN_ARM_LABEL).toEqual({ now: 'Current', days: 'Dates' })
    expect(calendarSource).toContain('label: WHEN_ARM_LABEL.now')
    expect(calendarSource).toContain('label: WHEN_ARM_LABEL.days')
    expect(calendarSource).not.toMatch(/label: '(Current|Dates)'/)
  })
})
