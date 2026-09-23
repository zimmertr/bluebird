import { describe, expect, it } from 'vitest'
import { contentWidth, fitContents, headerSpans, insertLine } from './columnMeasure'
import { placeAt, render } from '../testSupport/render'

// Three headers side by side, 100px each, and one body row under them.
function table() {
  const { container } = render(
    <table>
      <thead>
        <tr>
          {['a', 'b', 'c'].map((k) => (
            <th key={k} data-col={k}>
              <div data-col-inner style={{ width: '80px' }}>
                {k}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {['a', 'b', 'c'].map((k) => (
            <td key={k}>
              <div data-col-inner>{k}</div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>,
  )
  const ths = [...container.querySelectorAll('th')]
  ths.forEach((th, i) => placeAt(th, { left: i * 100, top: 5, width: 100, height: 24 }))
  return { table: container.querySelector('table')!, row: container.querySelector('thead tr')!, ths }
}

describe('contentWidth', () => {
  it('is the header box less its own padding', () => {
    const { ths } = table()
    ths[0].style.padding = '0 8px'
    Object.defineProperty(ths[0], 'clientWidth', { value: 100 })
    expect(contentWidth(ths[0])).toBe(84)
  })
})

describe('headerSpans', () => {
  it('lists every reorderable header left to right', () => {
    const { row } = table()
    expect(headerSpans(row)).toEqual([
      { key: 'a', start: 0, end: 100 },
      { key: 'b', start: 100, end: 200 },
      { key: 'c', start: 200, end: 300 },
    ])
  })
})

describe('insertLine', () => {
  it('stands on the edge the column would land against', () => {
    const { row } = table()
    expect(insertLine(row, { key: 'b', after: true })).toEqual({ x: 200, top: 5, height: 24 })
    expect(insertLine(row, { key: 'b', after: false })).toEqual({ x: 100, top: 5, height: 24 })
  })

  it('draws nothing without an edge or a header for it', () => {
    const { row } = table()
    expect(insertLine(row, null)).toBeNull()
    expect(insertLine(row, { key: 'z', after: false })).toBeNull()
  })
})

describe('fitContents', () => {
  it('measures every cell of the column at max-content, then restores each width', () => {
    const { table: t, ths } = table()
    const inners = [...t.querySelectorAll<HTMLElement>('[data-col-inner]')].filter((el) => {
      const cell = el.parentElement as HTMLTableCellElement
      return cell.cellIndex === 1
    })
    const seen: string[] = []
    inners.forEach((el, i) => {
      el.getBoundingClientRect = () => {
        seen.push(el.style.width)
        return { width: 40.5 + i } as DOMRect
      }
    })
    expect(fitContents(t, ths[1])).toEqual([40.5, 41.5])
    expect(seen).toEqual(['max-content', 'max-content'])
    expect(inners.map((el) => el.style.width)).toEqual(['80px', ''])
  })
})
