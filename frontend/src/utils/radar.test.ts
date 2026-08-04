import { describe, expect, it } from 'vitest'
import {
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

  it('steps by the service cadence and stops at the oldest offset that serves', () => {
    // m60m is a 404 upstream (measured 2026-08-04), so the loop is 55 minutes
    // deep and not an hour.
    const offsets = radarOffsets()
    expect(offsets).toEqual([55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0])
    expect(offsets.every((m, i) => i === 0 || offsets[i - 1] - m === RADAR_STEP_MIN)).toBe(true)
    expect(RADAR_FRAME_COUNT).toBe(12)
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
    expect(radarTileUrl(5)).toContain('nexrad-n0q-900913-m05m')
    expect(radarTileUrl(55)).toContain('nexrad-n0q-900913-m55m')
  })

  it('leaves the tile placeholders for MapLibre', () => {
    expect(radarTileUrl(15)).toMatch(/\{z\}\/\{x\}\/\{y\}\.png$/)
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
    expect(radarScaleEnds()).toEqual(['-55 min', 'Now'])
  })
})

describe('radarLayerId', () => {
  it('is unique per frame and stable across calls', () => {
    const ids = radarOffsets().map(radarLayerId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(radarLayerId(5)).toBe('radar-05')
  })
})
