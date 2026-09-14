import { describe, expect, it } from 'vitest'
import resultsTableSource from '../components/ResultsTable.tsx?raw'
import stylesSource from '../styles.ts?raw'
import columnsPickerSource from '../components/ColumnsPicker.tsx?raw'
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  GHOST_GAP_PX,
  GHOST_MAX_PX,
  dragBegins,
  dropEdge,
  ghostLeft,
  keyAtPosition,
  travel,
} from './columnDrag'

// Header cells as a table lays them out: adjacent, left to right.
const HEADERS = [
  { key: 'name', start: 0, end: 200 },
  { key: 'type', start: 200, end: 260 },
  { key: 'elevation_ft', start: 260, end: 360 },
]

describe('which column a drag is over', () => {
  it('names the column the pointer is inside', () => {
    expect(keyAtPosition(HEADERS, 100)).toBe('name')
    expect(keyAtPosition(HEADERS, 230)).toBe('type')
    expect(keyAtPosition(HEADERS, 300)).toBe('elevation_ft')
  })

  // A drag that runs off the end of the row is aiming at the end of the row.
  // Returning null there would snap the column back to where it started, which
  // reads as the drag having failed rather than as a drag past the edge.
  it('clamps to the nearest column beyond either end', () => {
    expect(keyAtPosition(HEADERS, -50)).toBe('name')
    expect(keyAtPosition(HEADERS, 900)).toBe('elevation_ft')
  })

  it('takes the nearer column when the pointer is in a gap', () => {
    const gapped = [
      { key: 'a', start: 0, end: 100 },
      { key: 'b', start: 140, end: 240 },
    ]
    expect(keyAtPosition(gapped, 110)).toBe('a')
    expect(keyAtPosition(gapped, 135)).toBe('b')
  })

  it('answers nothing when there are no columns', () => {
    expect(keyAtPosition([], 10)).toBeNull()
  })

  // A boundary belongs to the first span that holds it, so a drag sitting
  // exactly on a seam never reports two answers on two frames.
  it('is stable on a boundary', () => {
    expect(keyAtPosition(HEADERS, 200)).toBe('name')
  })
})

describe('when a press becomes a drag', () => {
  // The header answers a click with a sort, so a mouse press that has not
  // moved must stay a sort however long it is held.
  it('asks a mouse for travel, not for time', () => {
    expect(dragBegins('mouse', 0, 5_000)).toBe(false)
    expect(dragBegins('mouse', DRAG_THRESHOLD_PX, 0)).toBe(true)
    expect(dragBegins('mouse', DRAG_THRESHOLD_PX - 1, 0)).toBe(false)
  })

  // A finger has no hover and a wider tremor, so a slide is not an intent.
  it('asks a finger for time, not for travel', () => {
    expect(dragBegins('touch', 40, 0)).toBe(false)
    expect(dragBegins('touch', 0, LONG_PRESS_MS)).toBe(true)
    expect(dragBegins('pen', 0, LONG_PRESS_MS)).toBe(true)
    expect(dragBegins('touch', 0, LONG_PRESS_MS - 1)).toBe(false)
  })

  it('measures travel on both axes', () => {
    expect(travel(3, 4)).toBe(5)
    expect(travel(0, -DRAG_THRESHOLD_PX)).toBe(DRAG_THRESHOLD_PX)
  })
})

// The line that says where the column will land. A highlight on the column
// underneath cannot say it: dropping "on" a column is ambiguous about which
// side of it the carried column ends up.
describe('where the column would land', () => {
  it('draws before the column when dragging left', () => {
    expect(dropEdge(HEADERS, 'elevation_ft', 100)).toEqual({ key: 'name', after: false })
  })

  it('draws after the column when dragging right', () => {
    expect(dropEdge(HEADERS, 'name', 300)).toEqual({ key: 'elevation_ft', after: true })
  })

  // Back over its own column the line sits at the place the column came from,
  // rather than flicking to one side of it.
  it('rests on its own leading edge over itself', () => {
    expect(dropEdge(HEADERS, 'type', 230)).toEqual({ key: 'type', after: false })
  })

  it('answers nothing when there are no columns', () => {
    expect(dropEdge([], 'name', 10)).toBeNull()
  })
})

describe('where the ghost sits', () => {
  const WIDE = 1400

  it('sits beside the pointer where there is room', () => {
    expect(ghostLeft(300, WIDE)).toBe(300 + GHOST_GAP_PX)
  })

  // The grips that start a picker drag sit at the right edge of a popover that
  // sits at the right edge of the window, so this is the ordinary case there
  // rather than an edge case.
  it('flips to the other side rather than running off the screen', () => {
    const left = ghostLeft(WIDE - 20, WIDE)
    expect(left).toBe(WIDE - 20 - GHOST_GAP_PX - GHOST_MAX_PX)
    expect(left + GHOST_MAX_PX).toBeLessThan(WIDE)
  })

  it('stays on screen even when neither side has room', () => {
    expect(ghostLeft(10, 120)).toBeGreaterThanOrEqual(4)
  })
})

// The two surfaces and the traps between them. Asserted against the source
// text, like every other guard over a component here, because Vitest has no
// DOM to render either one into.
describe('the two surfaces that reorder columns', () => {
  it('reads both sources it claims to lint', () => {
    expect(resultsTableSource.length).toBeGreaterThan(500)
    expect(columnsPickerSource.length).toBeGreaterThan(500)
  })

  // Both ask this module rather than deciding for themselves, which is what
  // keeps a mouse and a finger answering the same question on both surfaces.
  it('asks this module when a press becomes a drag', () => {
    expect(resultsTableSource).toContain('dragBegins(')
    expect(columnsPickerSource).toContain('dragBegins(')
    expect(resultsTableSource).toContain('keyAtPosition(')
    expect(columnsPickerSource).toContain('keyAtPosition(')
  })

  // A drag leaves the cell it began in on its first frame, so a pointermove
  // over a sibling never reaches that cell. The header listens on document for
  // the same reason the resize drag above it does; losing this makes the
  // header drag silently do nothing.
  it('tracks the header drag on document, not on the cell', () => {
    expect(resultsTableSource).toContain("document.addEventListener('pointermove'")
  })

  // A press on the resize handle must never also move the column. The handle
  // stops its own pointerdown, and that is the whole guard.
  it('keeps the resize handle from reaching the reorder', () => {
    const resize = resultsTableSource.slice(
      resultsTableSource.indexOf('function beginColumnResize'),
      resultsTableSource.indexOf('function autoFitColumn'),
    )
    expect(resize).toContain('e.stopPropagation()')
  })

  // Both draw the same two pictures, and the move waits for the release: a
  // reorder on every frame moves the list under the hand that is still
  // choosing.
  it('draws a ghost and a line on both surfaces, and commits on release', () => {
    for (const source of [resultsTableSource, columnsPickerSource]) {
      expect(source).toContain('DRAG_GHOST')
      expect(source).toContain('DRAG_INSERT')
      expect(source).toContain('dropEdge(')
      expect(source).toContain('ghostLeft(')
      // The one call that moves anything sits in the release handler.
      expect(source).toContain('landing !== key) onColumnMove(key, landing)')
    }
  })

  // The ghost follows the pointer, so anything it can be hit-tested through is
  // a drag that cannot see the column underneath it.
  it('never lets the ghost take the pointer', () => {
    expect(stylesSource).toContain('pointer-events-none fixed')
  })

  // The browser claims an untouched gesture for scrolling, and the drag then
  // gets no second pointer event on a phone.
  it('holds the touch gesture on both surfaces', () => {
    expect(resultsTableSource).toContain("'touch-none'")
    expect(columnsPickerSource).toContain('DRAG_GRIP')
  })

  // A drag needs a pointer, so the grip carries the keyboard path. Losing it
  // makes reordering unreachable without a mouse.
  it('moves a column by the arrow keys too', () => {
    expect(columnsPickerSource).toContain("e.key === 'ArrowUp'")
    expect(columnsPickerSource).toContain("e.key === 'ArrowDown'")
  })
})
