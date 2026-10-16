import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SNOW_FAILED,
  SNOW_HELD_LAYER,
  SNOW_SOURCE,
  failedSnowSection,
  fetchSnowAt,
  formatInches,
  GLACIER_TITLE,
  isServiceError,
  parseSnowIdentify,
  parseValidTime,
  pendingSnowSection,
  readSnowAt,
  snowIdentifyUrl,
  snowPaints,
  snowSection,
  snowTileZoom,
  snowWord,
  snowWordOfPixel,
} from './snowPoint'
import { SNOW_BANDS, SNOW_MAX_ZOOM, SNOW_SERVICE_URL, SNOW_TILE_SIZE } from './snowDepth'
import { heldTiles } from './heldTiles'
import { storeHolding } from '../testSupport/heldTiles'
import { fakeResponse, snowIdentify } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'
import { updatedAt, updatedLine } from './popupChrome'
import type { GlacierCheck } from './glacierCell'

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

  // The card asks only where the map shows snow, so NOAA's class is not
  // consulted: the number is what NOAA says is there.
  it('reads the number whatever class NOAA paints it in', () => {
    expect(parseSnowIdentify(snowIdentify({ depthM: '0.02', depthClass: '0' }))?.depthIn).toBeCloseTo(0.787, 3)
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

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const bandColor = (from: number) => {
  const [r, g, b] = hex(SNOW_BANDS.find((band) => band.from === from)!.color!)
  return [r, g, b, 255] as const
}
const AT = { lng: -121.76, lat: 46.85, zoom: 11 }
const held = (rgba: readonly [number, number, number, number]) =>
  storeHolding({ size: SNOW_TILE_SIZE, layer: SNOW_HELD_LAYER, ...AT, z: snowTileZoom(AT.zoom), rgba })
const READING = { depthIn: 151.2, sweIn: 83.4, validMs: VALID_MS }

describe('snowWord', () => {
  // NOAA's own band boundaries, four words that say only how deep (TJ,
  // 2026-10-16, #748).
  it('names a depth by the band it falls in', () => {
    expect(snowWord(0.39)).toBe('Light snow')
    expect(snowWord(3.89)).toBe('Light snow')
    expect(snowWord(3.9)).toBe('Moderate snow')
    expect(snowWord(20)).toBe('Deep snow')
    expect(snowWord(59)).toBe('Very deep snow')
    expect(snowWord(196)).toBe('Very deep snow')
    // A record winter's snowpack passes 197 in where nothing is permanent.
    expect(snowWord(769)).toBe('Very deep snow')
  })

  // The renders paint in exactly NOAA's legend colours, so the pixel names
  // the band before NOAA is asked anything.
  it('names a painted pixel by the legend colour it wears', () => {
    expect(snowWordOfPixel(bandColor(9.8))).toBe('Moderate snow')
    expect(snowWordOfPixel(bandColor(394))).toBe('Very deep snow')
    expect(snowWordOfPixel([0, 0, 0, 0])).toBeNull()
    expect(snowWordOfPixel([1, 2, 3, 255])).toBeNull()
    expect(snowWordOfPixel(null)).toBeNull()
  })
})

describe('snowTileZoom', () => {
  it('picks the zoom MapLibre loads a 512 px tile at, no deeper than the source goes', () => {
    expect(snowTileZoom(7.4)).toBe(7)
    expect(snowTileZoom(7.6)).toBe(8)
    expect(snowTileZoom(16)).toBe(SNOW_MAX_ZOOM)
  })
})

describe('snowPaints', () => {
  it('answers from the held tile, and outside the analysis without a lookup', async () => {
    expect(await snowPaints(held(bandColor(20)), AT)).toBe(true)
    expect(await snowPaints(held([0, 0, 0, 0]), AT)).toBe(false)
    expect(snowPaints(heldTiles({ size: SNOW_TILE_SIZE }), { lng: 10, lat: 46, zoom: 9 })).toBe(false)
  })
})

describe('the snow sections', () => {
  // The name and the source on the band, every number in the body with when
  // it was measured (TJ, 2026-10-16).
  it('opens with its name, its source and a bar for each value on its way', () => {
    const section = pendingSnowSection('Very deep snow')
    expect(section.title).toBe('Very deep snow')
    expect(section.source).toBe(SNOW_SOURCE)
    expect(section.rows.map(markupText)).toEqual(['Depth: ', 'Snow water equivalent: ', 'Updated: '])
    expect(section.rows.every((r) => r.includes('aria-hidden'))).toBe(true)
  })

  it('fills the values NOAA answered, the time with its date', () => {
    const section = snowSection('Very deep snow', READING)
    expect(section.rows.map(markupText)).toEqual([
      'Depth: 151 in',
      'Snow water equivalent: 83 in',
      `Updated: ${updatedAt(VALID_MS)}`,
    ])
    // The date is fine print, as on every overlay card that says one (TJ, 2026-10-16).
    expect(section.rows[2]).toBe(updatedLine(String(updatedAt(VALID_MS))))
  })

  // Every snow section has the same lines (#748).
  it('marks a value NOAA did not give rather than leaving its row off', () => {
    const section = snowSection('Light snow', { depthIn: 2, sweIn: null, validMs: null })
    expect(section.rows.map(markupText)).toEqual(['Depth: 2.0 in', 'Snow water equivalent: N/A', 'Updated: N/A'])
  })

  // On a glacier the name says where the numbers stand, and the numbers
  // stay NOAA's (TJ, 2026-10-16, #748).
  it('names a glacier and keeps NOAA\'s numbers there', () => {
    expect(pendingSnowSection('Very deep snow', true).title).toBe(GLACIER_TITLE)
    const section = snowSection('Very deep snow', READING, true)
    expect(section.title).toBe(GLACIER_TITLE)
    expect(section.rows.map(markupText)).toEqual(['Depth: 151 in', 'Snow water equivalent: 83 in', `Updated: ${updatedAt(VALID_MS)}`])
  })

  it('says NOAA failed in place of the values, keeping its name', () => {
    const section = failedSnowSection('Deep snow')
    expect(section.title).toBe('Deep snow')
    expect(section.rows).toEqual([SNOW_FAILED])
  })
})

describe('fetchSnowAt', () => {
  it('asks NOAA once and reads the answer', async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse(snowIdentify()))
    vi.stubGlobal('fetch', fetch)
    expect((await fetchSnowAt(-105.6, 40.25, signal())).depthIn).toBeCloseTo(4.33, 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks once more after an error inside a 200', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(SERVICE_ERROR))
      .mockResolvedValueOnce(fakeResponse(snowIdentify()))
    vi.stubGlobal('fetch', fetch)
    expect((await fetchSnowAt(-105.6, 40.25, signal())).depthIn).toBeCloseTo(4.33, 2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails after a second error, on a status that is not a success, and on no depth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => fakeResponse(SERVICE_ERROR)))
    await expect(fetchSnowAt(-105.6, 40.25, signal())).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({}, 503)))
    await expect(fetchSnowAt(-105.6, 40.25, signal())).rejects.toThrow('HTTP 503')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ results: [] })))
    await expect(fetchSnowAt(-105.6, 40.25, signal())).rejects.toThrow()
  })
})

// A glacier check that knows its answer at once, and one that must ask.
const OFF_GLACIER: GlacierCheck = { now: () => false, ask: async () => false }
const asksGlacier = (answer: boolean): GlacierCheck => ({ now: () => undefined, ask: async () => answer })

describe('readSnowAt', () => {
  // The card opens on the name alone; NOAA's numbers come later.
  it('names the snow at once from the pixel and fills the values later', async () => {
    const reading = await readSnowAt(held(bandColor(98)), AT, signal(), async () => READING, OFF_GLACIER)
    expect(reading?.section).toEqual(pendingSnowSection('Very deep snow'))
    expect(await reading?.later).toEqual(snowSection('Very deep snow', READING))
  })

  it('settles to the failure line when NOAA cannot answer, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reading = await readSnowAt(
      held(bandColor(20)),
      AT,
      signal(),
      async () => {
        throw new Error('down')
      },
      OFF_GLACIER,
    )
    expect(await reading?.later).toEqual(failedSnowSection('Deep snow'))
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  // A closed card is no failure to tell anyone about.
  it('rejects quietly once its card is gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ac = new AbortController()
    const reading = await readSnowAt(
      held(bandColor(20)),
      AT,
      ac.signal,
      async () => {
        ac.abort()
        throw new DOMException('aborted', 'AbortError')
      },
      OFF_GLACIER,
    )
    await expect(reading?.later).rejects.toThrow()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('names a glacier at once where its tiles are in hand', async () => {
    const reading = await readSnowAt(held(bandColor(394)), AT, signal(), async () => READING, { now: () => true, ask: async () => true })
    expect(reading?.section).toEqual(pendingSnowSection('Very deep snow', true))
    expect(await reading?.later).toEqual(snowSection('Very deep snow', READING, true))
  })

  // A glacier whose tiles were not in hand takes its name with its numbers.
  it('names a glacier with its numbers where it had to ask', async () => {
    const reading = await readSnowAt(held(bandColor(394)), AT, signal(), async () => READING, asksGlacier(true))
    expect(reading?.section.title).toBe('Very deep snow')
    expect((await reading?.later)?.title).toBe(GLACIER_TITLE)
  })

  it('keeps a glacier\'s name when NOAA fails there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reading = await readSnowAt(
      held(bandColor(394)),
      AT,
      signal(),
      async () => {
        throw new Error('down')
      },
      asksGlacier(true),
    )
    expect(await reading?.later).toEqual(failedSnowSection(GLACIER_TITLE))
    warn.mockRestore()
  })

  it('reads nothing where the field painted nothing, and asks NOAA nothing', async () => {
    const fetchReading = vi.fn()
    expect(await readSnowAt(held([0, 0, 0, 0]), AT, signal(), fetchReading, OFF_GLACIER)).toBeNull()
    expect(await readSnowAt(held(bandColor(20)), { lng: 10, lat: 46, zoom: 9 }, signal(), fetchReading, OFF_GLACIER)).toBeNull()
    expect(fetchReading).not.toHaveBeenCalled()
  })
})
