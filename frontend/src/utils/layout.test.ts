import { describe, it, expect } from 'vitest'
import { clampPanelHeight } from './layout'

describe('clampPanelHeight', () => {
  it('grows with an upward drag when there is room', () => {
    expect(clampPanelHeight(200, 100, 300, 1500)).toBe(300)
  })

  it('shrinks with a downward drag but not below the floor', () => {
    expect(clampPanelHeight(200, -60, 300, 1500)).toBe(140)
    expect(clampPanelHeight(200, -500, 300, 1500)).toBe(120)
  })

  it('caps growth so the map keeps its minimum height', () => {
    // viewport 1000 − mapMin 280 − reserved 300 → ceil 420, so a 400px drag
    // that would reach 800 is held at 420.
    expect(clampPanelHeight(400, 400, 300, 1000, 280)).toBe(420)
  })

  it('never returns below the floor even when space is exhausted', () => {
    // viewport 500 − 280 − 300 is negative; the ceil floors, then so does the result.
    expect(clampPanelHeight(200, 100, 300, 500, 280, 120)).toBe(120)
  })
})
