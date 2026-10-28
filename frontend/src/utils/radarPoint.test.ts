import { describe, expect, it } from 'vitest'
import {
  HAIL_CAP_DBZ,
  RADAR_SOURCE,
  N0Q_PALETTE_SIZE,
  RADAR_TILE_PX,
  WEAK_ECHO_DBZ,
  dbzOfPixel,
  formatRainRate,
  NO_ECHO_TITLE,
  RADAR_TITLES,
  noEchoSection,
  rereadRadarAt,
  formatReflectivity,
  N0Q_CEILING_DBZ,
  N0Q_FLOOR_DBZ,
  radarHeldLayer,
  radarPaints,
  radarSection,
  radarTileZoom,
  radarTitle,
  radarUpdated,
  rainRateInPerHour,
  readRadarAt,
} from './radarPoint'
import { heldTiles } from './heldTiles'
import { storeHolding } from '../testSupport/heldTiles'
import { markupText } from '../testSupport/markupText'
import { updatedLine } from './popup/popupChrome'

// A moderate echo's colour, index 130 of the palette: 32.5 dBZ.
const MODERATE = [9, 111, 12, 255] as const
const AT = { lng: -121.5, lat: 47.5, zoom: 7 }
const held = (offset: number, rgba: readonly [number, number, number, number] = MODERATE) =>
  storeHolding({ size: RADAR_TILE_PX, layer: radarHeldLayer(offset), ...AT, z: radarTileZoom(AT.zoom), rgba })

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
    expect(formatRainRate(0.454)).toBe('~0.45 in/h')
    expect(formatRainRate(3.86)).toBe('~3.9 in/h')
  })

  // A rate at the cap is a floor, marked as the cloud deck marks its ceiling
  // (TJ, 2026-10-16).
  it('marks a rate held at the cap as a floor', () => {
    expect(formatRainRate(2.948, true)).toBe('≥2.9 in/h')
  })
})

describe('formatReflectivity', () => {
  // The composite's ends are bounds, inclusive: an echo past either is encoded
  // there, so a pixel at one says only that the echo reached it (TJ, 2026-10-16).
  it('marks the top and the bottom of the composite as bounds, and nothing between', () => {
    expect(N0Q_CEILING_DBZ).toBe(95)
    expect(N0Q_FLOOR_DBZ).toBe(-32)
    expect(formatReflectivity(95)).toBe('≥95.0 dBZ')
    expect(formatReflectivity(94.5)).toBe('94.5 dBZ')
    expect(formatReflectivity(-32)).toBe('≤-32.0 dBZ')
    expect(formatReflectivity(-31.5)).toBe('-31.5 dBZ')
  })
})

describe('radarSection', () => {
  // The band names what the echo is and where it comes from; when it was
  // measured is data, in the body with the rest (TJ, 2026-10-16).
  it('names the echo and its source, and lists its values and when it was measured', () => {
    const section = radarSection(38.5, 0)
    expect(section.title).toBe('Moderate precipitation')
    expect(section.source).toBe(RADAR_SOURCE)
    expect(section.rows.map(markupText)).toEqual([
      'Rate: ~0.37 in/h',
      'Reflectivity: 38.5 dBZ',
      'Updated: now',
    ])
  })

  // Inclusive: an echo at the cap reads the cap's rate, so it is a floor too.
  it('marks the rate a floor from the hail cap up, and an estimate under it', () => {
    const rate = (dbz: number) => markupText(radarSection(dbz, 0).rows[0])
    expect(rate(52.5)).toBe('Rate: ~2.7 in/h')
    expect(rate(HAIL_CAP_DBZ)).toBe('Rate: ≥2.9 in/h')
    expect(rate(59)).toBe('Rate: ≥2.9 in/h')
  })

  // Under the threshold an echo is as likely birds as drizzle, so it has no
  // rate to give, and says so in a row of its own so the card keeps its
  // height through playback (TJ, 2026-10-16, #748).
  it('gives a weak echo no rain rate, keeping the row', () => {
    expect(radarSection(5, 20).rows.map(markupText)).toEqual(['Rate: N/A', 'Reflectivity: 5.0 dBZ', 'Updated: 20 min ago'])
    // The frame's age is fine print, as every overlay card's date is (TJ, 2026-10-16).
    expect(radarSection(5, 20).rows[2]).toBe(updatedLine('20 min ago'))
  })

  // A card open through playback stays open on a frame that painted nothing
  // at its point (TJ, 2026-10-16, #748).
  it('says a frame had no echo, with the same rows as one that did', () => {
    const section = noEchoSection(30)
    expect(section.title).toBe(NO_ECHO_TITLE)
    expect(section.source).toBe(RADAR_SOURCE)
    expect(section.rows.map(markupText)).toEqual(['Rate: 0 in/h', 'Reflectivity: N/A', 'Updated: 30 min ago'])
    expect(section.rows).toHaveLength(radarSection(38.5, 0).rows.length)
  })

  // The card is kept as wide as the widest name it can take (#752), so the
  // list has to hold every name the radar can give, at every reflectivity
  // the palette paints.
  it('lists every name a radar section can take, on every section', () => {
    const named = new Set<string>([NO_ECHO_TITLE])
    for (let dbz = N0Q_FLOOR_DBZ; dbz <= N0Q_CEILING_DBZ; dbz += 0.5) named.add(radarSection(dbz, 0).title)
    expect([...named].sort()).toEqual([...RADAR_TITLES].sort())
    expect(radarSection(38.5, 0).titles).toBe(RADAR_TITLES)
    expect(noEchoSection(30).titles).toBe(RADAR_TITLES)
  })

  it('says how old an older frame is', () => {
    expect(radarUpdated(0)).toBe('now')
    expect(radarUpdated(40)).toBe('40 min ago')
  })
})

describe('radarTileZoom', () => {
  // MapLibre asks a 256 px raster for round(zoom + 1).
  it('picks the zoom MapLibre loads a 256 px raster at', () => {
    expect(radarTileZoom(4.4)).toBe(5)
    expect(radarTileZoom(4.6)).toBe(6)
    expect(radarTileZoom(-1)).toBe(0)
    expect(radarTileZoom(30)).toBe(22)
  })
})

describe('radarPaints', () => {
  it('answers once the tile is decoded, and at once after that', async () => {
    const tiles = held(0)
    const first = radarPaints(tiles, 0, AT)
    expect(first).toBeInstanceOf(Promise)
    expect(await first).toBe(true)
    expect(radarPaints(tiles, 0, AT)).toBe(true)
  })

  it('reads the frame it is told is on screen', async () => {
    expect(await radarPaints(held(20), 0, AT)).toBe(false)
    expect(await radarPaints(held(20), 20, AT)).toBe(true)
  })

  it('is false where nothing was painted, and outside every radar without a lookup', async () => {
    expect(await radarPaints(held(0, [0, 0, 0, 0]), 0, AT)).toBe(false)
    expect(radarPaints(heldTiles({ size: RADAR_TILE_PX }), 0, { lng: 10, lat: 46, zoom: 7 })).toBe(false)
  })
})

describe('rereadRadarAt', () => {
  it('reads the frame now on screen for a card already open', async () => {
    const section = await rereadRadarAt(held(30), 30, AT)
    expect(section.title).toBe('Moderate precipitation')
    expect(section.rows.map(markupText)).toContain('Updated: 30 min ago')
  })

  // The map shows no echo there either way, so the card says so rather than closing.
  it('answers no echo where the frame painted nothing, or holds no tile yet', async () => {
    expect((await rereadRadarAt(held(0, [0, 0, 0, 0]), 0, AT)).title).toBe(NO_ECHO_TITLE)
    expect((await rereadRadarAt(heldTiles({ size: RADAR_TILE_PX }), 20, AT)).title).toBe(NO_ECHO_TITLE)
  })
})

describe('readRadarAt', () => {
  // Every value is in the pixel, so the reading is whole at once.
  it('reads the frame on screen into a whole section, with nothing to wait for', async () => {
    const reading = await readRadarAt(held(30), 30, AT)
    expect(reading?.section.title).toBe('Moderate precipitation')
    expect(reading?.section.rows.map(markupText)).toContain('Updated: 30 min ago')
    expect(reading?.later).toBeUndefined()
  })

  it('reads nothing where the frame painted nothing', async () => {
    expect(await readRadarAt(held(0, [0, 0, 0, 0]), 0, AT)).toBeNull()
    expect(await readRadarAt(heldTiles({ size: RADAR_TILE_PX }), 0, AT)).toBeNull()
  })
})
