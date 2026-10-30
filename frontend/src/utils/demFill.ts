// Elevation tiles for the relief and the 3D terrain past zoom 12 (#799): the
// finest Mapterhorn tile under each address, or the window of a coarser one
// stretched to fill it, packed back into the Terrarium encoding MapLibre's
// `raster-dem` sources read.
//
// MapLibre draws a `raster-dem` tile that fails as a hole and cannot fall
// back to the zoom below, and Mapterhorn answers past 12 only where a
// national survey reaches, so the relief and the 3D terrain stopped at 12,
// about 13 m a pixel at Squak Mountain, under slope bands drawn from 16. A
// tile served through `map/slope.ts`'s scheme always answers, so their
// sources can reach the slope's zoom. Where a survey has the zoom the tile is
// Mapterhorn's own; where it has not, it is the coarser tile's heights,
// smoothed rather than blocky, so the relief reads exactly as it did at 12
// stretched (the maintainer, 2026-10-30).
import type { DemWindow, HeightGrid } from './slopeAngle'

/**
 * The window of `grid` that `window` names, stretched to the grid's full
 * size by bilinear interpolation of the heights: each output pixel samples
 * its own centre in the window's coordinates. At a window of the whole tile
 * it is the grid's own heights. A height the grid lacks (NaN) carries NaN
 * into the pixels that read it.
 */
export function stretchWindow(grid: HeightGrid, window: Pick<DemWindow, 'left' | 'top' | 'span'>): Float32Array {
  const { width: w, height: h, data } = grid
  const { left, top, span } = window
  if (span === w && left === 0 && top === 0) return data.slice()
  const out = new Float32Array(w * h)
  const step = span / w
  for (let row = 0; row < h; row++) {
    const sy = Math.min(Math.max(top + (row + 0.5) * step - 0.5, 0), h - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, h - 1)
    const fy = sy - y0
    for (let col = 0; col < w; col++) {
      const sx = Math.min(Math.max(left + (col + 0.5) * step - 0.5, 0), w - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, w - 1)
      const fx = sx - x0
      const top0 = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx
      const top1 = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx
      out[row * w + col] = top0 * (1 - fy) + top1 * fy
    }
  }
  return out
}

/**
 * Heights in metres as Terrarium RGBA, Mapterhorn's encoding and the one the
 * sources declare: the height plus 32,768, its whole part split across red
 * and green and its fraction in blue. A missing height is written as sea
 * level, which is what a `raster-dem` source draws where a tile has none.
 */
export function terrariumRgba(heights: Float32Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(heights.length * 4)
  for (let i = 0; i < heights.length; i++) {
    const v = (Number.isNaN(heights[i]) ? 0 : heights[i]) + 32768
    const whole = Math.floor(v)
    out[i * 4] = whole >> 8
    out[i * 4 + 1] = whole & 255
    out[i * 4 + 2] = Math.floor((v - whole) * 256)
    out[i * 4 + 3] = 255
  }
  return out
}

/** A Terrarium pixel's height in metres, the decoding {@link terrariumRgba} is the inverse of. */
export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}
