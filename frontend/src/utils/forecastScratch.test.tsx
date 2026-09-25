import { describe, expect, it } from 'vitest'
import {
  NO_DATA,
  STORAGE_KEY,
  cacheGet,
  cachePut,
  enterForecastScratch,
  leaveForecastScratch,
  resetForecastCache,
} from './forecastStore'

// In the DOM project, where the module finds a window and a sessionStorage and
// arms the save on the way out of the page. The tutorial (#536) swaps in a
// cache of its own, and a tab closed mid-tutorial must store the reader's
// forecasts and none of the demo's.
describe('the forecast scratch', () => {
  it('keeps the demo out of the reader\'s cache and out of storage', () => {
    resetForecastCache()
    sessionStorage.clear()
    cachePut('reader', NO_DATA)
    enterForecastScratch()
    try {
      expect(cacheGet('reader')).toBeUndefined()
      cachePut('demo', NO_DATA)
      expect(cacheGet('demo')).toBe(NO_DATA)
      window.dispatchEvent(new Event('pagehide'))
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as { entries?: { k: string }[] }
      expect(saved.entries?.map((e) => e.k)).toEqual(['reader'])
    } finally {
      leaveForecastScratch()
    }
    expect(cacheGet('reader')).toBe(NO_DATA)
    expect(cacheGet('demo')).toBeUndefined()
  })
})
