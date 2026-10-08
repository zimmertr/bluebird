import { describe, expect, it } from 'vitest'
import {
  RADAR_EXTENTS,
  RADAR_FRAME_COUNT,
  RADAR_OLDEST_MIN,
  RADAR_STEP_MIN,
  radarLayerId,
  radarOffsetLabel,
  radarOffsets,
  radarScaleEnds,
  radarTileUrl,
} from './radar'

describe('radarOffsets', () => {
  it('runs oldest to newest so index 0 is the start of the loop', () => {
    const offsets = radarOffsets()
    expect(offsets[0]).toBe(RADAR_OLDEST_MIN)
    expect(offsets[offsets.length - 1]).toBe(0)
  })

  it('steps evenly and stops at the oldest offset that serves', () => {
    const offsets = radarOffsets()
    expect(offsets).toEqual([50, 40, 30, 20, 10, 0])
    expect(offsets.every((m, i) => i === 0 || offsets[i - 1] - m === RADAR_STEP_MIN)).toBe(true)
  })

  it('keeps the loop inside what MapLibre will actually load', () => {
    // Measured: at twelve raster sources the tile queue jams — six frames load,
    // the seventh stalls partway, and the rest are never requested, with every
    // missing tile answering 200 to a direct fetch. Six is the number that
    // works, and it is also half the requests against a donated server.
    expect(RADAR_FRAME_COUNT).toBe(6)
    expect(RADAR_OLDEST_MIN).toBeLessThanOrEqual(55) // m60m is a 404 upstream
  })
})

describe('radarTileUrl', () => {
  it('asks for the bare product at the newest frame', () => {
    // IEM publishes no -m00m alias; asking for one 404s the one frame the
    // layer opens on.
    expect(radarTileUrl(0)).toBe(
      'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png',
    )
  })

  it('zero-pads the offset, which is how the service spells it', () => {
    expect(radarTileUrl(10)).toContain('nexrad-n0q-900913-m10m')
    expect(radarTileUrl(50)).toContain('nexrad-n0q-900913-m50m')
  })

  it('leaves the tile placeholders for MapLibre', () => {
    expect(radarTileUrl(20)).toMatch(/\{z\}\/\{x\}\/\{y\}\.png$/)
  })
})

describe('labels', () => {
  it('names the newest frame Now rather than negative zero', () => {
    expect(radarOffsetLabel(0)).toBe('Now')
  })

  it('states every other frame as how far behind the present it is', () => {
    expect(radarOffsetLabel(25)).toBe('-25 min')
  })

  it('scales the track from the oldest frame to now', () => {
    expect(radarScaleEnds()).toEqual(['-50 min', 'Now'])
  })
})

describe('radarLayerId', () => {
  it('is unique per frame and stable across calls', () => {
    const ids = radarOffsets().map(radarLayerId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(radarLayerId(10)).toBe('radar-10')
  })
})

describe('RADAR_EXTENTS', () => {
  const inside = (lng: number, lat: number) =>
    RADAR_EXTENTS.some(([w, s, e, n]) => lng >= w && lng <= e && lat >= s && lat <= n)

  // Probed 2026-10-07: the tiles over these four carried echoes, and the
  // tiles over the open Pacific and Europe were the empty image.
  it('reaches every radar the mosaic paints and nowhere it does not', () => {
    expect([
      inside(-121.8, 46.9), // Rainier
      inside(-149.9, 61.2), // Anchorage
      inside(-157.9, 21.3), // Honolulu
      inside(-66.1, 18.5), // San Juan
      inside(144.8, 13.5), // Guam
    ]).toEqual([true, true, true, true, true])
    expect([inside(-170, 25), inside(7.7, 46.0), inside(127, 37.5)]).toEqual([false, false, false])
  })
})
