import { describe, expect, it } from 'vitest'
import {
  MAX_COL_PX,
  MIN_COL_PX,
  autoFitWidth,
  clampColWidth,
  defaultNameWidth,
  dragWidth,
} from './columnResize'

describe('clamping', () => {
  it('holds the floor and the ceiling', () => {
    expect(clampColWidth(1)).toBe(MIN_COL_PX)
    expect(clampColWidth(10_000)).toBe(MAX_COL_PX)
    expect(clampColWidth(120)).toBe(120)
  })

  it('rounds to whole pixels so widths do not drift fractionally per drag', () => {
    expect(clampColWidth(120.6)).toBe(121)
  })
})

describe('dragging', () => {
  it('moves from the start width by the pointer travel, both directions', () => {
    expect(dragWidth(120, 30)).toBe(150)
    expect(dragWidth(120, -30)).toBe(90)
  })

  it('stops at the floor instead of collapsing the column', () => {
    expect(dragWidth(120, -500)).toBe(MIN_COL_PX)
  })
})

describe('double-click auto-fit', () => {
  it('fits the longest cell exactly, ceiling fractional measurements', () => {
    expect(autoFitWidth([80, 140, 95])).toBe(140)
    expect(autoFitWidth([80, 139.2, 95])).toBe(140)
  })

  // The first double-click on an already-fitting column must be a no-op to
  // the eye: fitting the same contents twice yields the same width.
  it('is idempotent', () => {
    const first = autoFitWidth([80, 139.2, 95])
    expect(autoFitWidth([80, 139.2, 95, first])).toBe(first)
  })

  it('clamps an empty or absurd column like any other width', () => {
    expect(autoFitWidth([])).toBe(MIN_COL_PX)
    expect(autoFitWidth([9000])).toBe(MAX_COL_PX)
  })
})

describe('the Name default', () => {
  it('opens at three quarters of the natural width', () => {
    expect(defaultNameWidth(200)).toBe(150)
  })

  it('never defaults below the usable floor', () => {
    expect(defaultNameWidth(40)).toBe(MIN_COL_PX)
  })
})
