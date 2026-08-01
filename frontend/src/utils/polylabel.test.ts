import { describe, expect, it } from 'vitest'
import { Ring, poleOfInaccessibility, signedDistance, widestPole } from './polylabel'

const SQUARE: Ring = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]

// A bent lake: the shape the centroid gets wrong. Its arms run north and east
// from a corner, so the centroid of the bounding mass falls in the notch,
// outside the water entirely.
const ELBOW: Ring = [
  [0, 0],
  [10, 0],
  [10, 3],
  [3, 3],
  [3, 10],
  [0, 10],
]

describe('signedDistance', () => {
  it('is positive inside and negative outside', () => {
    expect(signedDistance(5, 5, [SQUARE])).toBeCloseTo(5)
    expect(signedDistance(1, 5, [SQUARE])).toBeCloseTo(1)
    expect(signedDistance(-2, 5, [SQUARE])).toBeCloseTo(-2)
  })

  it('is zero on the boundary', () => {
    expect(signedDistance(0, 5, [SQUARE])).toBeCloseTo(0)
  })

  it('measures to a hole edge as readily as to the outer ring', () => {
    const hole: Ring = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ]
    // Dead centre of the square is now the middle of the hole: 1 from its edge,
    // and the crossing count makes it outside.
    expect(signedDistance(5, 5, [SQUARE, hole])).toBeCloseTo(-1)
  })
})

describe('poleOfInaccessibility', () => {
  it('finds the middle of a square', () => {
    const [x, y] = poleOfInaccessibility([SQUARE], 1e-3)
    expect(x).toBeCloseTo(5, 2)
    expect(y).toBeCloseTo(5, 2)
  })

  // The whole reason this exists rather than a centroid.
  it('stays inside a shape whose centroid is not', () => {
    // Area-weighted centroid of the L: the 30-unit arm pulls it to (5, 1.5),
    // the 21-unit arm to (1.5, 6.5), and the weighted result lands at
    // (3.56, 3.56) — in the notch, off the water.
    const centroid: [number, number] = [3.56, 3.56]
    expect(signedDistance(centroid[0], centroid[1], [ELBOW])).toBeLessThan(0)

    const pole = poleOfInaccessibility([ELBOW], 1e-3)
    expect(signedDistance(pole[0], pole[1], [ELBOW])).toBeGreaterThan(0)
  })

  it('avoids a hole rather than landing in it', () => {
    const hole: Ring = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ]
    const pole = poleOfInaccessibility([SQUARE, hole], 1e-3)
    expect(signedDistance(pole[0], pole[1], [SQUARE, hole])).toBeGreaterThan(0)
  })

  // A tighter precision must not move the answer meaningfully — it only buys
  // decimal places — which is what lets the default be chosen for cost.
  it('converges rather than wandering as precision tightens', () => {
    const coarse = poleOfInaccessibility([ELBOW], 1e-2)
    const fine = poleOfInaccessibility([ELBOW], 1e-6)
    expect(Math.hypot(coarse[0] - fine[0], coarse[1] - fine[1])).toBeLessThan(0.05)
  })

  it('is deterministic, so the same lake resolves to the same destination twice', () => {
    expect(poleOfInaccessibility([ELBOW])).toEqual(poleOfInaccessibility([ELBOW]))
  })

  it('survives degenerate rings instead of hanging', () => {
    expect(poleOfInaccessibility([[]])).toEqual([0, 0])
    expect(
      poleOfInaccessibility([
        [
          [3, 7],
          [3, 7],
        ],
      ]),
    ).toEqual([3, 7])
  })

  // Real lake outlines are thousands of points; the search must be driven by
  // the precision target rather than by how finely the shore is traced.
  it('stays fast on a finely traced outline', () => {
    const circle: Ring = Array.from(
      { length: 4_000 },
      (_, i) =>
        [5 + 5 * Math.cos((i / 4_000) * 2 * Math.PI), 5 + 5 * Math.sin((i / 4_000) * 2 * Math.PI)] as [
          number,
          number,
        ],
    )
    const started = performance.now()
    const [x, y] = poleOfInaccessibility([circle], 1e-4)
    expect(performance.now() - started).toBeLessThan(500)
    expect(x).toBeCloseTo(5, 1)
    expect(y).toBeCloseTo(5, 1)
  })
})

// A lake arrives as however many pieces of it are on screen: a multipolygon in
// the data, split again at every tile boundary it crosses.
describe('widestPole', () => {
  const NARROW: Ring = [
    [0, 0],
    [20, 0],
    [20, 1],
    [0, 1],
  ]
  const ROOMY: Ring = [
    [30, 0],
    [40, 0],
    [40, 10],
    [30, 10],
  ]

  it('picks the piece with the roomiest interior', () => {
    const [x, y] = widestPole([[NARROW], [ROOMY]], 1e-3)!
    expect(x).toBeCloseTo(35, 1)
    expect(y).toBeCloseTo(5, 1)
  })

  it('does not depend on the order the pieces arrive in', () => {
    expect(widestPole([[NARROW], [ROOMY]], 1e-3)).toEqual(widestPole([[ROOMY], [NARROW]], 1e-3))
  })

  // Poling each piece separately is the point: merged into one ring list, the
  // even-odd test would read the second piece's outline as the first's hole.
  it('keeps a result inside the piece it came from', () => {
    const pole = widestPole([[NARROW], [ROOMY]], 1e-3)!
    expect(signedDistance(pole[0], pole[1], [ROOMY])).toBeGreaterThan(0)
  })

  it('reports nothing rather than guessing when there are no polygons', () => {
    expect(widestPole([])).toBeNull()
    expect(widestPole([[]])).toBeNull()
  })
})
