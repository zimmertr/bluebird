import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatInches,
  formatValidTime,
  isServiceError,
  parseSnowIdentify,
  parseValidTime,
  readSnowAt,
  snowIdentifyUrl,
  snowSection,
} from './snowPoint'
import { SNOW_SERVICE_URL } from './snowDepth'
import { fakeResponse, snowIdentify } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'

// The ArcGIS error the service sometimes answers with a 200 (2026-10-16).
const SERVICE_ERROR = {
  status: 'error',
  messages: ['Could not access any server machines. Please contact your system administrator.  '],
}
const VALID_MS = Date.UTC(2026, 9, 16, 12)
const signal = () => new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

describe('snowIdentifyUrl', () => {
  // The service resamples to the pixel the extent implies, so a wide extent
  // reads a coarser cell, or NoData: the box is a hundredth of a degree.
  it('asks for the depth, the water and the valid time in a box one cell wide', () => {
    const url = new URL(snowIdentifyUrl(-105.6, 40.25))
    expect(`${url.origin}${url.pathname}`).toBe(`${SNOW_SERVICE_URL}/identify`)
    expect(url.searchParams.get('layers')).toBe('all:2,3,7')
    expect(url.searchParams.get('geometry')).toBe('-105.6,40.25')
    const [w, s, e, n] = url.searchParams.get('mapExtent')!.split(',').map(Number)
    expect(e - w).toBeCloseTo(0.01)
    expect(n - s).toBeCloseTo(0.01)
    expect(url.searchParams.get('imageDisplay')).toBe('10,10,96')
    expect(url.searchParams.get('f')).toBe('json')
  })
})

describe('parseValidTime', () => {
  it('reads the service time as UTC', () => {
    expect(parseValidTime('10/16/2026 12:00:00 PM')).toBe(VALID_MS)
    expect(parseValidTime('1/2/2026 12:30:00 AM')).toBe(Date.UTC(2026, 0, 2, 0, 30))
    expect(parseValidTime('1/2/2026 5:00:00 PM')).toBe(Date.UTC(2026, 0, 2, 17))
  })

  it('reads nothing it cannot parse', () => {
    expect(parseValidTime(undefined)).toBeNull()
    expect(parseValidTime('2026-10-16T12:00:00Z')).toBeNull()
  })
})

describe('parseSnowIdentify', () => {
  it('reads the depth from metres and the water from millimetres, in inches', () => {
    const reading = parseSnowIdentify(snowIdentify())!
    expect(reading.depthIn).toBeCloseTo(4.33, 2)
    expect(reading.sweIn).toBeCloseTo(0.709, 3)
    expect(reading.validMs).toBe(VALID_MS)
  })

  // Measured: 0.02 m came back in class 0, which NOAA draws transparent. The
  // card follows the paint, so a click there opens nothing.
  it('reads nothing where NOAA paints nothing, whatever the number', () => {
    expect(parseSnowIdentify(snowIdentify({ depthM: '0.02', depthClass: '0' }))).toBeNull()
    expect(parseSnowIdentify(snowIdentify({ depthM: '0', depthClass: '0' }))).toBeNull()
  })

  it('reads nothing outside the analysis or where it has no data', () => {
    expect(parseSnowIdentify({ results: [] })).toBeNull()
    expect(parseSnowIdentify(snowIdentify({ depthM: 'NoData', depthClass: '' }))).toBeNull()
    expect(parseSnowIdentify(SERVICE_ERROR)).toBeNull()
  })

  it('keeps the depth when the water or the time did not come back', () => {
    const reading = parseSnowIdentify(snowIdentify({ sweMm: 'NoData', validTime: '' }))!
    expect(reading.sweIn).toBeNull()
    expect(reading.validMs).toBeNull()
  })
})

describe('isServiceError', () => {
  it('tells an error inside a 200 from an empty answer', () => {
    expect(isServiceError(SERVICE_ERROR)).toBe(true)
    expect(isServiceError({ results: [] })).toBe(false)
    expect(isServiceError(null)).toBe(true)
  })
})

describe('formatInches', () => {
  it('prints a decimal under ten inches and whole inches above, grouped', () => {
    expect(formatInches(4.33)).toBe('4.3 in')
    expect(formatInches(0.709)).toBe('0.7 in')
    expect(formatInches(20.4)).toBe('20 in')
    // A glacier cell the analysis never melts out (Rainier's summit read 74.58 m).
    expect(formatInches(2936.2)).toBe('2,936 in')
  })
})

describe('snowSection', () => {
  it('names the depth and NOAA, with the water as its value', () => {
    const reading = { depthIn: 20.4, sweIn: 4.1, validMs: VALID_MS }
    const time = formatValidTime(VALID_MS, VALID_MS)
    const section = snowSection(reading, VALID_MS)
    expect(section.title).toBe('20 in of snow')
    expect(section.source).toBe(`NOAA snow analysis, ${time}`)
    expect(section.rows.map(markupText)).toEqual(['Snow water equivalent: 4.1 in'])
  })

  it('leaves off what the analysis did not say', () => {
    const section = snowSection({ depthIn: 5, sweIn: null, validMs: null }, VALID_MS)
    expect(section.source).toBe('NOAA snow analysis')
    expect(section.rows).toEqual([])
  })
})

describe('formatValidTime', () => {
  it('prints the time alone on the day it is read, and the date with it after', () => {
    const today = formatValidTime(VALID_MS, VALID_MS)
    const later = formatValidTime(VALID_MS, VALID_MS + 3 * 86_400_000)
    expect(later).toContain(today)
    expect(later).not.toBe(today)
  })
})

describe('readSnowAt', () => {
  it('asks NOAA and returns the section', async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse(snowIdentify()))
    vi.stubGlobal('fetch', fetch)
    const section = await readSnowAt(-105.6, 40.25, signal(), VALID_MS)
    expect(section?.title).toBe('4.3 in of snow')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // MapLibre requests nothing outside SNOW_BOUNDS, and neither does a click.
  it('asks nothing outside the analysis', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await readSnowAt(10, 46, signal())).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks once more after an error inside a 200', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(SERVICE_ERROR))
      .mockResolvedValueOnce(fakeResponse(snowIdentify()))
    vi.stubGlobal('fetch', fetch)
    expect((await readSnowAt(-105.6, 40.25, signal(), VALID_MS))?.title).toBe('4.3 in of snow')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails after a second error, and on a status that is not a success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => fakeResponse(SERVICE_ERROR)))
    await expect(readSnowAt(-105.6, 40.25, signal())).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({}, 503)))
    await expect(readSnowAt(-105.6, 40.25, signal())).rejects.toThrow('HTTP 503')
  })

  it('returns nothing where NOAA paints nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(snowIdentify({ depthM: '0', depthClass: '0' }))))
    expect(await readSnowAt(-105.6, 40.25, signal())).toBeNull()
  })
})
