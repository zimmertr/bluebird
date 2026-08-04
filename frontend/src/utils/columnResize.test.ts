import { describe, expect, it } from 'vitest'
import {
  FIT_PAD_PX,
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
  it('fits the longest cell, header included, plus the pad', () => {
    expect(autoFitWidth([80, 140, 95])).toBe(140 + FIT_PAD_PX)
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
