import { describe, expect, it } from 'vitest'
import {
  CLOUD_ALPHA,
  CLOUD_RGB,
  EDGE_FT,
  REACH_KM,
  type DeckPoint,
  cloudAlpha,
  cloudRaster,
  deckAt,
  deckPoints,
  inCloud,
  sampleHeights,
  tileBounds,
  tileInReach,
} from './cloudSea'
import { CLOUD_DECK_CEILING_FT } from './openMeteoAggregate'
import { FEET_PER_METER } from './basemapPoi'

// The cloud sea (record 0309): the deck the report holds, interpolated
// between destinations and laid against the ground's height.

const RAINIER = { lon: -121.76, lat: 46.853 }
const deck = (baseFt: number | null, topFt: number | null, at = RAINIER): DeckPoint => ({ ...at, baseFt, topFt })
const DRY = deck(CLOUD_DECK_CEILING_FT, CLOUD_DECK_CEILING_FT)

describe('deckAt', () => {
  it('reads a lone destination in cloud as its own deck, whole', () => {
    const at = deckAt([deck(2000, 5000)], RAINIER.lon, RAINIER.lat)!
    expect(at).toMatchObject({ baseFt: 2000, topFt: 5000, share: 1, reach: 1 })
  })

  it('never averages a dry column into the deck, and says how much is in cloud', () => {
    const east = { lon: RAINIER.lon + 0.1, lat: RAINIER.lat }
    const at = deckAt([deck(2000, 5000), { ...DRY, ...east }], RAINIER.lon + 0.05, RAINIER.lat)!
    expect(at.baseFt).toBe(2000)
    expect(at.topFt).toBe(5000)
    expect(at.share).toBeCloseTo(0.5, 5)
  })

  it('reads all dry as no deck, and nothing in reach as nothing to say', () => {
    expect(deckAt([DRY], RAINIER.lon, RAINIER.lat)?.share).toBe(0)
    // A degree of latitude is 111 km, well past the reach.
    expect(deckAt([deck(2000, 5000)], RAINIER.lon, RAINIER.lat + 1)).toBeNull()
    expect(REACH_KM).toBeLessThan(111)
  })

  it('fades the reach out over its last third', () => {
    const away = (km: number) => deckAt([deck(2000, 5000)], RAINIER.lon, RAINIER.lat + km / 111.32)!.reach
    expect(away(REACH_KM / 2)).toBe(1)
    expect(away(REACH_KM * (5 / 6))).toBeCloseTo(0.5, 5)
  })

  it('takes an hour with no number for a dry one', () => {
    expect(inCloud(deck(null, null))).toBe(false)
    expect(inCloud(deck(2000, null))).toBe(false)
    expect(inCloud(DRY)).toBe(false)
    expect(inCloud(deck(2000, 5000))).toBe(true)
  })
})

describe('cloudAlpha', () => {
  const whole = { baseFt: 3000, topFt: 6000, share: 1, reach: 1 }

  it('paints the ground inside the deck, veils it under, and leaves it clear above the top', () => {
    for (const theme of ['dark', 'light'] as const) {
      const { inside, under } = CLOUD_ALPHA[theme]
      expect(cloudAlpha(4500, whole, theme)).toBe(inside)
      expect(cloudAlpha(1000, whole, theme)).toBe(under)
      expect(cloudAlpha(6000, whole, theme)).toBe(0)
      expect(cloudAlpha(9000, whole, theme)).toBe(0)
    }
  })

  it('fades the top and the base over EDGE_FT', () => {
    const { inside, under } = CLOUD_ALPHA.light
    expect(cloudAlpha(6000 - EDGE_FT / 2, whole, 'light')).toBeCloseTo(inside / 2, 5)
    expect(cloudAlpha(3000 - EDGE_FT / 2, whole, 'light')).toBeCloseTo((under + inside) / 2, 5)
  })

  it('draws nothing under a quarter in cloud, and all of it over three quarters', () => {
    const at = (share: number) => cloudAlpha(4500, { ...whole, share }, 'dark')
    expect(at(0.25)).toBe(0)
    expect(at(0.5)).toBeCloseTo(CLOUD_ALPHA.dark.inside / 2, 5)
    expect(at(0.75)).toBe(CLOUD_ALPHA.dark.inside)
    expect(cloudAlpha(4500, null, 'dark')).toBe(0)
  })
})

describe('the tiles', () => {
  // Zoom 10's tile over Rainier.
  const Z = 10
  const X = Math.floor(((RAINIER.lon + 180) / 360) * 2 ** Z)
  const phi = (RAINIER.lat * Math.PI) / 180
  const Y = Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * 2 ** Z)

  it('bounds a tile around the point it was found from', () => {
    const [w, s, e, n] = tileBounds(Z, X, Y)
    expect(w).toBeLessThan(RAINIER.lon)
    expect(e).toBeGreaterThan(RAINIER.lon)
    expect(s).toBeLessThan(RAINIER.lat)
    expect(n).toBeGreaterThan(RAINIER.lat)
  })

  it('asks for a tile in reach of the field and none far from it', () => {
    expect(tileInReach([deck(2000, 5000)], Z, X, Y)).toBe(true)
    expect(tileInReach([deck(2000, 5000)], Z, X + 20, Y)).toBe(false)
  })

  const flat = (metres: number, size = 8) => ({ size, metres: new Float32Array(size * size).fill(metres) })

  it('paints a valley under the deck in the theme’s cloud, and a summit above it clear', () => {
    const points = [deck(2000, 5000)]
    const valley = cloudRaster(points, Z, X, Y, flat(3000 / FEET_PER_METER), 'light')
    // The pixel nearest the destination, where the reach is whole; the
    // tile's far corners stand past two thirds of it and fade.
    const alphas = [...valley].filter((_, i) => i % 4 === 3)
    const strongest = alphas.indexOf(Math.max(...alphas))
    expect([...valley.slice(strongest * 4, strongest * 4 + 3)]).toEqual([...CLOUD_RGB.light])
    expect(alphas[strongest]).toBe(Math.round(CLOUD_ALPHA.light.inside * 255))
    const summit = cloudRaster(points, Z, X, Y, flat(8000 / FEET_PER_METER), 'light')
    expect(summit.every((v) => v === 0)).toBe(true)
  })

  it('samples an elevation grid of any size by its nearest pixel', () => {
    const data = new Float32Array([1, 2, 3, 4])
    const { metres } = sampleHeights({ width: 2, height: 2, data }, 4)
    expect([...metres]).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4])
  })
})

describe('deckPoints', () => {
  it('reads each row’s deck at the hour, an hour it lacks as none', () => {
    const rows = [
      { longitude: 1, latitude: 2, series: { cloud_deck_ft: [100, 200], cloud_top_ft: [300, 400] } },
      { longitude: 3, latitude: 4, series: null },
    ]
    expect(deckPoints(rows, 1)).toEqual([
      { lon: 1, lat: 2, baseFt: 200, topFt: 400 },
      { lon: 3, lat: 4, baseFt: null, topFt: null },
    ])
  })
})
