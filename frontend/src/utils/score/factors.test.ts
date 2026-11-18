import { describe, expect, it } from 'vitest'
import { CLOUD_DECK_CEILING_FT } from '../openMeteoAggregate'
import { AIR_CURVE, COMFORT_CURVE, DRY_CURVE, WIND_CURVE, freshFactor, ramp, skyFactor } from './factors'

describe('ramp', () => {
  it('runs straight between its points and clamps past both ends', () => {
    expect(ramp(WIND_CURVE, 0)).toBe(1)
    expect(ramp(WIND_CURVE, 15)).toBeCloseTo(0.85)
    expect(ramp(WIND_CURVE, 25)).toBeCloseTo(0.5)
    expect(ramp(WIND_CURVE, 60)).toBe(0)
  })

  it('holds the approved points of every curve', () => {
    expect([10, 20, 30, 40].map((x) => ramp(WIND_CURVE, x))).toEqual([1, 0.7, 0.3, 0])
    expect([-10, 10, 25, 40, 70, 85].map((x) => ramp(COMFORT_CURVE, x))).toEqual([0, 0.4, 0.75, 1, 1, 0.6])
    expect([0, 0.01, 0.05, 0.1].map((x) => ramp(DRY_CURVE, x))).toEqual([1, 0.7, 0.3, 0])
    expect([50, 100, 150, 200].map((x) => ramp(AIR_CURVE, x))).toEqual([1, 0.6, 0.2, 0])
  })
})

describe('skyFactor', () => {
  it('reads a dry column as a clear sky whatever the elevation', () => {
    expect(skyFactor(8000, CLOUD_DECK_CEILING_FT, CLOUD_DECK_CEILING_FT)).toBe(1)
    expect(skyFactor(null, CLOUD_DECK_CEILING_FT, CLOUD_DECK_CEILING_FT)).toBe(1)
  })

  it('reads a summit above the layer as clear and one inside it as ruined', () => {
    expect(skyFactor(8000, 3000, 6000)).toBe(1)
    expect(skyFactor(8000, 7000, 9000)).toBe(0)
  })

  it('brightens a deck overhead the higher it stands, to 5,000 ft over the summit', () => {
    expect(skyFactor(8000, 8000.5, 12000)).toBeCloseTo(0.5)
    expect(skyFactor(8000, 10500, 12000)).toBeCloseTo(0.75)
    expect(skyFactor(8000, 14000, 16000)).toBe(1)
  })

  it('says nothing for an hour with no column, and splits the difference with no elevation', () => {
    expect(skyFactor(8000, null, null)).toBeNull()
    expect(skyFactor(null, 4000, 6000)).toBe(0.5)
  })
})

describe('freshFactor', () => {
  it('counts the snow of the 24 hours before against six inches', () => {
    const snow = [...Array(24).fill(0.125), 0]
    expect(freshFactor(snow, 24)).toBeCloseTo(0.5)
    expect(freshFactor([...Array(24).fill(0.5), 0], 24)).toBe(1)
  })

  it('is worth less while it is still snowing, and nothing on a dry day', () => {
    expect(freshFactor([...Array(24).fill(0.5), 0.2], 24)).toBeCloseTo(0.3)
    expect(freshFactor([0, 0, 0], 2)).toBe(0)
  })

  it('has no answer past the end of the series', () => {
    expect(freshFactor([0], 3)).toBeNull()
  })
})
