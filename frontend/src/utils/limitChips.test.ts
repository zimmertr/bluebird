import { describe, expect, it } from 'vitest'
import { NO_CONSTRAINTS } from './constraints'
import { hiddenText, limitChips, withUnit } from './limitChips'

// The bounds named in plain words in the results header (record 0319).
describe('limitChips', () => {
  it('names nothing with no bound set', () => {
    expect(limitChips(NO_CONSTRAINTS)).toEqual([])
  })

  it('names each bound set in words, with its unit', () => {
    const chips = limitChips({ ...NO_CONSTRAINTS, maxWindMph: 30, minTempF: 15, maxAqi: 100, minFreezeFt: 9000 })
    expect(chips.map((c) => c.text).sort()).toEqual(
      ['AQI under 100', 'Freezing level above 9,000 ft', 'Temperature above 15°F', 'Wind under 30 mph'].sort(),
    )
    expect(chips.find((c) => c.text.startsWith('Wind'))?.key).toBe('maxWindMph')
  })

  it('says a ceiling of nothing on precipitation the prototype\'s way', () => {
    expect(limitChips({ ...NO_CONSTRAINTS, maxPrecipTotalIn: 0 }).map((c) => c.text)).toEqual(['Nothing falling'])
    expect(limitChips({ ...NO_CONSTRAINTS, maxPrecipTotalIn: 0.1 }).map((c) => c.text)).toEqual(['Precipitation under 0.1 in'])
  })

  it('writes a unit after a space, a degree without one, and AQI bare', () => {
    expect(withUnit(30, 'wind')).toBe('30 mph')
    expect(withUnit(15, 'temp')).toBe('15°F')
    expect(withUnit(100, 'aqi')).toBe('100')
  })

  it('counts the hidden rows, and says nothing for none', () => {
    expect(hiddenText(12)).toBe('12 hidden by limits')
    expect(hiddenText(0)).toBeNull()
  })
})
