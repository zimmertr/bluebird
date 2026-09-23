// The forecast grid's raster: the kept samples as one RGBA pixel buffer, a
// pixel per lattice cell, which MapLibre magnifies with the filter the chosen
// style names. A buffer rather than a canvas, so Vitest can assert on it
// without a DOM.

import { SortBy } from '../types'
import { NO_VALUE, fillColor } from './resultFeatures'
import type { GridCell, GridSpec } from './forecastGridLattice'

/**
 * How the field is drawn. `blocks` is the default because it is the style that
 * cannot overstate what was sampled: every square is one answer, and you can
 * count them.
 */
export type GridStyle = 'blocks' | 'smooth'

export const GRID_STYLES: GridStyle[] = ['blocks', 'smooth']

export function isGridStyle(value: string): value is GridStyle {
  return (GRID_STYLES as string[]).includes(value)
}

/** A raster ready to be handed to an image source: RGBA, row 0 at the north. */
export interface GridRaster {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/**
 * The field as one pixel per sample.
 *
 * Deliberately tiny — a 600-sample lattice is a ~25×24 image — because the
 * smoothing is the raster layer's job. `raster-resampling: linear` magnifies it
 * on the GPU, which is both free and the same bilinear the field is entitled
 * to between adjacent model grid cells. Interpolating here instead would mean
 * writing (and testing) a resampler that the renderer already contains, and
 * re-running it at every zoom level.
 *
 * Two passes rather than one. The first writes the colours it has. The second
 * spreads colour (not opacity) outward into the samples that have none, because
 * a transparent pixel still carries an RGB value into a bilinear blend: leave
 * it black and every gap grows a dark halo as the renderer mixes toward it.
 *
 * Rows are flipped on the way out. The lattice counts north from its
 * south-west corner and an image counts south from its top-left one.
 */
export function gridRaster(
  spec: GridSpec,
  cells: readonly GridCell[],
  sortBy: SortBy,
  hourIndex: number | null,
  style: GridStyle = 'smooth',
): GridRaster | null {
  if (cells.length === 0) return null
  const { cols, rows } = spec
  const rgba = new Uint8ClampedArray(cols * rows * 4)

  // The SPEC's kept set, not the painted-so-far cells: the field fills in
  // chunk by chunk, and a rim judged against what has landed would fade
  // interior samples whose neighbours simply haven't arrived yet, then
  // un-fade them a repaint later.
  const kept = new Set(spec.indices)

  for (const { index, row } of cells) {
    const color = fillColor(row, sortBy, hourIndex)
    if (color === NO_VALUE) continue
    const r = Math.floor(index / cols)
    const c = index % cols
    const p = ((rows - 1 - r) * cols + c) * 4
    rgba[p] = parseInt(color.slice(1, 3), 16)
    rgba[p + 1] = parseInt(color.slice(3, 5), 16)
    rgba[p + 2] = parseInt(color.slice(5, 7), 16)
    rgba[p + 3] = style === 'smooth' ? edgeAlpha(r, c, cols, rows, kept) : 255
  }

  bleedColor(rgba, cols, rows)
  return { width: cols, height: rows, rgba }
}

/**
 * How opaque one sample is drawn, which is full everywhere except the field's
 * rim — the kept cells whose neighbour is missing.
 *
 * With the reach limit the field is a blob hugging the destinations, so "the
 * rim" is no longer the lattice's outermost ring: it is any kept cell with an
 * absent 4-neighbour, whether that neighbour fell outside the lattice or
 * outside every destination's reach. On a dense rectangle the two definitions
 * coincide, which is what keeps the pre-reach fade behaviour byte-identical.
 * The rim sits at the reach's edge, outside the destinations: it is the least
 * load-bearing data in the lattice and the right place to spend on an edge.
 * Fading through it is what keeps the field from ending in a hard boundary
 * that reads as UI chrome rather than as the edge of what was sampled.
 *
 * Decided per AXIS rather than for the lattice as a whole, because the two are
 * routinely very different: a north-south polygon over the Cascades grids four
 * columns wide and eight rows tall, and a single "is there an interior?" test
 * would either fade a lattice that has no column to spare or refuse to fade one
 * whose rows had plenty.
 *
 * Neighbours are tested as (row, column) COORDINATES, never by raw index
 * arithmetic: `index - 1` at column zero is a valid index — the previous row's
 * LAST cell — and an index-only test would read the far edge as this cell's
 * western neighbour.
 *
 * Smooth only. Blocks draws a boundary at every sample, so a ring of
 * half-transparent squares reads as a row of samples that answered weakly
 * rather than as an edge; smooth has no boundaries at all, and without the fade
 * would simply stop in a hard line.
 */
function edgeAlpha(
  r: number,
  c: number,
  cols: number,
  rows: number,
  kept: ReadonlySet<number>,
): number {
  const missing = (rr: number, cc: number) =>
    rr < 0 || rr >= rows || cc < 0 || cc >= cols || !kept.has(rr * cols + cc)
  const onColEdge = cols >= MIN_AXIS_TO_FADE && (missing(r, c - 1) || missing(r, c + 1))
  const onRowEdge = rows >= MIN_AXIS_TO_FADE && (missing(r - 1, c) || missing(r + 1, c))
  return onColEdge || onRowEdge ? EDGE_ALPHA : 255
}

// Five is the smallest lattice with an interior wide enough that fading its
// ring leaves more data than edge. Below it the ring IS the data.
const MIN_AXIS_TO_FADE = 5
const EDGE_ALPHA = 40

// Spread colour into fully transparent pixels from whichever neighbour has
// some, leaving their opacity alone. Bilinear magnification reads RGB from
// transparent pixels too, so a gap left at rgba(0,0,0,0) drags every
// neighbouring blend toward black — a dark fringe around exactly the places
// the field knows nothing about. Iterated so a gap wider than one sample fills
// from both sides rather than only its first ring.
//
// Harmless under `nearest`, which never blends and so never reads the colour of
// a pixel it is not drawing. Run for both rather than branched, because the
// cost is a pass over ~600 pixels and a branch here would be one more thing
// that could disagree between the two styles.
function bleedColor(rgba: Uint8ClampedArray, cols: number, rows: number): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = (r * cols + c) * 4
        if (rgba[p + 3] !== 0 || rgba[p] !== 0 || rgba[p + 1] !== 0 || rgba[p + 2] !== 0) continue
        for (const [dr, dc] of NEIGHBOURS) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
          const q = (nr * cols + nc) * 4
          if (rgba[q] === 0 && rgba[q + 1] === 0 && rgba[q + 2] === 0) continue
          rgba[p] = rgba[q]
          rgba[p + 1] = rgba[q + 1]
          rgba[p + 2] = rgba[q + 2]
          changed = true
          break
        }
      }
    }
    if (!changed) return
  }
}

const NEIGHBOURS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]
