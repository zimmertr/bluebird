import { describe, expect, it } from 'vitest'
import { stretchWindow, terrariumHeight, terrariumRgba } from './demFill'

const grid = (size: number, at: (col: number, row: number) => number) => {
  const data = new Float32Array(size * size)
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) data[row * size + col] = at(col, row)
  return { width: size, height: size, data }
}

describe('stretchWindow', () => {
  it('is the grid itself for the whole tile', () => {
    const g = grid(4, (c, r) => c + 10 * r)
    expect(Array.from(stretchWindow(g, { left: 0, top: 0, span: 4 }))).toEqual(Array.from(g.data))
  })

  // A plane stays a plane: bilinear heights carry its slope on smoothly
  // rather than in steps, so the relief over a stretched tile is not terraced.
  it('stretches a window of a plane into the same plane, finer', () => {
    const g = grid(8, (c) => c * 10)
    const out = stretchWindow(g, { left: 2, top: 2, span: 4 })
    // Output pixel centres sample at 2 + (col + 0.5) / 2 - 0.5, so heights rise 5 a pixel.
    expect(Array.from(out.subarray(0, 8))).toEqual([17.5, 22.5, 27.5, 32.5, 37.5, 42.5, 47.5, 52.5])
    expect(out[8 * 3 + 4]).toBeCloseTo(37.5, 10)
  })
})

describe('terrariumRgba', () => {
  it('round-trips a height to a 256th of a metre', () => {
    for (const h of [0, 1234.5, -50.25, 4392.75]) {
      const [r, g, b, a] = terrariumRgba(new Float32Array([h]))
      expect([terrariumHeight(r, g, b), a]).toEqual([h, 255])
    }
  })

  it('writes a missing height as sea level', () => {
    const [r, g, b] = terrariumRgba(new Float32Array([Number.NaN]))
    expect(terrariumHeight(r, g, b)).toBe(0)
  })
})
