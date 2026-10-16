import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HAIL_CAP_DBZ,
  N0Q_PALETTE_SIZE,
  RADAR_TILE_PX,
  WEAK_ECHO_DBZ,
  dbzOfPixel,
  formatRainRate,
  radarSection,
  radarSource,
  radarTileHref,
  radarTilePixel,
  radarTitle,
  rainRateInPerHour,
  readRadarAt,
} from './radarPoint'
import { fakeResponse } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'

const signal = () => new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

describe('the N0Q palette', () => {
  // A colour can name a value only if no two values share one.
  it('carries 256 distinct colours, one per value of the composite', () => {
    expect(N0Q_PALETTE_SIZE).toBe(256)
  })

  // Entries read off IEM's composite on 2026-10-16.
  it('reads a painted colour as its value, to the half dBZ', () => {
    expect(dbzOfPixel(133, 113, 143, 255)).toBe(-32)
    expect(dbzOfPixel(144, 152, 180, 255)).toBe(0)
    expect(dbzOfPixel(9, 111, 12, 255)).toBe(32.5)
    expect(dbzOfPixel(255, 143, 0, 255)).toBe(47.5)
    expect(dbzOfPixel(58, 98, 181, 255)).toBe(95)
  })

  it('reads nothing where nothing is painted', () => {
    expect(dbzOfPixel(9, 111, 12, 0)).toBeNull()
    // Index 0 is the composite's no-data black.
    expect(dbzOfPixel(0, 0, 0, 255)).toBeNull()
    // A blend, as the map's canvas would carry, matches no entry.
    expect(dbzOfPixel(10, 111, 12, 255)).toBeNull()
  })
})

describe('radarTitle', () => {
  it('names an echo by the conventional thresholds', () => {
    expect(radarTitle(WEAK_ECHO_DBZ - 0.5)).toBe('Weak radar echo')
    expect(radarTitle(-18)).toBe('Weak radar echo')
    expect(radarTitle(15)).toBe('Light precipitation')
    expect(radarTitle(29.5)).toBe('Light precipitation')
    expect(radarTitle(30)).toBe('Moderate precipitation')
    expect(radarTitle(40)).toBe('Heavy precipitation')
    expect(radarTitle(50)).toBe('Very heavy precipitation')
  })
})

describe('rainRateInPerHour', () => {
  // Marshall and Palmer, Z = 200 R^1.6: 40 dBZ is Z = 10^4, so R is 50^(1/1.6)
  // mm/h, 11.53 mm/h, 0.454 in/h.
  it('follows Z = 200 R^1.6', () => {
    expect(rainRateInPerHour(40)).toBeCloseTo(0.454, 3)
    expect(rainRateInPerHour(20)).toBeCloseTo(0.0255, 4)
  })

  // Past 53 dBZ an echo is usually hail: the rate stops where the NWS's does.
  it('reads no higher than the hail cap', () => {
    expect(rainRateInPerHour(59)).toBe(rainRateInPerHour(HAIL_CAP_DBZ))
    expect(rainRateInPerHour(HAIL_CAP_DBZ)).toBeCloseTo(2.95, 2)
    expect(rainRateInPerHour(52.5)).toBeLessThan(rainRateInPerHour(HAIL_CAP_DBZ))
  })

  it('prints two decimals under an inch an hour and one above', () => {
    expect(formatRainRate(0.454)).toBe('about 0.45 in/h')
    expect(formatRainRate(3.86)).toBe('about 3.9 in/h')
  })
})

describe('radarSection', () => {
  it('names the echo, its frame, its reflectivity and its rain rate', () => {
    const section = radarSection(38.5, 0)
    expect(section.title).toBe('Moderate precipitation')
    expect(section.source).toBe('NEXRAD radar, now')
    expect(section.rows.map(markupText)).toEqual(['Reflectivity: 38.5 dBZ', 'Rain rate: about 0.37 in/h'])
  })

  // Under the threshold an echo is as likely birds as drizzle, so no rate.
  it('gives a weak echo no rain rate', () => {
    expect(radarSection(5, 20).rows.map(markupText)).toEqual(['Reflectivity: 5.0 dBZ'])
  })

  it('names an older frame by its age', () => {
    expect(radarSource(0)).toBe('NEXRAD radar, now')
    expect(radarSource(20)).toBe('NEXRAD radar, 20 min ago')
  })
})

describe('radarTilePixel', () => {
  // MapLibre asks a 256 px raster for round(zoom + 1).
  it('picks the zoom MapLibre loads a 256 px raster at', () => {
    expect(radarTilePixel(0, 0, 4.4).z).toBe(5)
    expect(radarTilePixel(0, 0, 4.6).z).toBe(6)
    expect(radarTilePixel(0, 0, -1).z).toBe(0)
  })

  it('finds the tile and the pixel under a point', () => {
    expect(radarTilePixel(0, 0, 0)).toEqual({ z: 1, x: 1, y: 1, px: 0, py: 0 })
    expect(radarTilePixel(-180, 85.05, 0)).toEqual({ z: 1, x: 0, y: 0, px: 0, py: 0 })
    const { px, py } = radarTilePixel(179.999, -85.05, 3)
    expect([px, py]).toEqual([RADAR_TILE_PX - 1, RADAR_TILE_PX - 1])
  })

  it('names the tile URL MapLibre fetched for that frame', () => {
    expect(radarTileHref(20, { z: 5, x: 7, y: 12, px: 0, py: 0 })).toBe(
      'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913-m20m/5/7/12.png',
    )
  })
})

describe('readRadarAt', () => {
  it('reads the pixel of the frame on screen and returns its section', async () => {
    const fetch = vi.fn().mockResolvedValue(fakeResponse({ raw: 'png' }))
    vi.stubGlobal('fetch', fetch)
    const read = vi.fn().mockResolvedValue([9, 111, 12, 255])
    const section = await readRadarAt(-121.5, 47.5, 7, 30, signal(), read)
    expect(section?.title).toBe('Moderate precipitation')
    expect(section?.source).toBe('NEXRAD radar, 30 min ago')
    const at = radarTilePixel(-121.5, 47.5, 7)
    expect(fetch.mock.calls[0][0]).toBe(radarTileHref(30, at))
    expect(read.mock.calls[0].slice(1)).toEqual([at.px, at.py])
  })

  it('returns nothing where the frame painted nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ raw: 'png' })))
    expect(await readRadarAt(-121.5, 47.5, 7, 0, signal(), async () => [0, 0, 0, 0])).toBeNull()
  })

  it('asks nothing where no radar reaches', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await readRadarAt(10, 46, 7, 0, signal(), vi.fn())).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails on a status that is not a success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({}, 404)))
    await expect(readRadarAt(-121.5, 47.5, 7, 0, signal(), vi.fn())).rejects.toThrow('HTTP 404')
  })
})
