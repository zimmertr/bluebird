import { describe, expect, it } from 'vitest'
import { addVertex, insertionIndex } from './polygonEdit'

// A unit square, counter-clockwise from the origin. Small enough that the
// longitude cosine is ~1, so the expected answers are the ones you would get
// on a flat plane.
const SQUARE: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

describe('insertionIndex', () => {
  it('appends while the ring is still being traced', () => {
    expect(insertionIndex([], [0, 0])).toBe(0)
    expect(insertionIndex([[0, 0]], [1, 0])).toBe(1)
    expect(
      insertionIndex(
        [
          [0, 0],
          [1, 0],
        ],
        [1, 1],
      ),
    ).toBe(2)
  })

  // The bug #118 names: with a closed ring, a click beside the first edge used
  // to land at the end of the array and drag a chord across the polygon.
  it('places a click on the edge it is nearest, not on the end', () => {
    expect(insertionIndex(SQUARE, [0.5, -0.1])).toBe(1)
    expect(insertionIndex(SQUARE, [1.1, 0.5])).toBe(2)
    expect(insertionIndex(SQUARE, [0.5, 1.1])).toBe(3)
    expect(insertionIndex(SQUARE, [-0.1, 0.5])).toBe(4)
  })

  // The closing edge (last vertex back to first) is a real edge and gets its
  // own index, which is what "append" accidentally got right and everything
  // else got wrong.
  it('treats the closing edge like any other', () => {
    expect(insertionIndex(SQUARE, [-0.01, 0.5])).toBe(SQUARE.length)
  })

  // A perpendicular foot beyond the end of a segment is why detour beats
  // perpendicular distance: this point is 0.1 from the y=0 edge's infinite
  // line, but it sits off that segment's end and beside the x=0 edge.
  it('ignores an edge whose nearest approach is off its end', () => {
    expect(insertionIndex(SQUARE, [-0.4, 0.1])).toBe(4)
  })

  // Real rings are drawn away from the equator, where the longitude scale is
  // well under 1. The edge choice has to survive that, or a click beside a
  // north-south edge at latitude would be judged against east-west edges
  // measured in different units.
  it('picks the same edge for a ring at high latitude', () => {
    const alpine = SQUARE.map(([x, y]) => [x - 121, y + 47] as [number, number])
    expect(insertionIndex(alpine, [-120.5, 46.9])).toBe(1)
    expect(insertionIndex(alpine, [-119.9, 47.5])).toBe(2)
    expect(insertionIndex(alpine, [-120.5, 48.1])).toBe(3)
    expect(insertionIndex(alpine, [-121.1, 47.5])).toBe(4)
  })
})

describe('addVertex', () => {
  it('splices the point in without disturbing the rest of the ring', () => {
    expect(addVertex(SQUARE, [0.5, -0.1])).toEqual([
      [0, 0],
      [0.5, -0.1],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
  })

  it('appends while the ring is incomplete', () => {
    expect(
      addVertex(
        [
          [0, 0],
          [1, 0],
        ],
        [1, 1],
      ),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ])
  })

  it('leaves the original array alone', () => {
    const pts: [number, number][] = [...SQUARE]
    addVertex(pts, [0.5, -0.1])
    expect(pts).toEqual(SQUARE)
  })
})
