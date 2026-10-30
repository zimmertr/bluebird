import { describe, expect, it } from 'vitest'
import {
  BASE_LAYERS,
  DEFAULT_BASE_OPACITY,
  OPACITY_DEFAULT,
  clampOpacity,
  opacityOf,
  overDefault,
} from './baseMapOpacity'
import { SLOPE_ALPHA } from './slopeAngle'

describe('the base-map opacity levels', () => {
  // Every slider starts at half, the strength each layer drew at before it
  // had one (record 0243), and the slope's tuned strength is that half.
  it('starts every layer at half, the slope\'s tuned strength', () => {
    expect(OPACITY_DEFAULT).toBe(50)
    expect(BASE_LAYERS).toEqual(['satellite', 'topo', 'relief', 'slope'])
    expect(DEFAULT_BASE_OPACITY).toEqual({ satellite: 50, topo: 50, relief: 50, slope: 50 })
    expect(opacityOf(OPACITY_DEFAULT)).toBe(SLOPE_ALPHA)
  })

  it('holds a level to a whole percent from 0 to 100', () => {
    expect(clampOpacity(62.4)).toBe(62)
    expect(clampOpacity(-5)).toBe(0)
    expect(clampOpacity(250)).toBe(100)
    expect(opacityOf(80)).toBe(0.8)
    expect(opacityOf(120)).toBe(1)
  })

  it('reads a level as a multiple of the default look, 1 at the default and 2 at 100', () => {
    expect(overDefault(opacityOf(50))).toBe(1)
    expect(overDefault(opacityOf(100))).toBe(2)
    expect(overDefault(opacityOf(25))).toBe(0.5)
    expect(overDefault(0)).toBe(0)
  })
})
