import { describe, expect, it } from 'vitest'
import { rowTapOpens } from './rowTap'

// Built by hand rather than rendered: the rule reads the DOM a press lands
// in and nothing React adds to it.
function row(html: string): HTMLTableRowElement {
  const table = document.createElement('table')
  table.innerHTML = `<tbody><tr>${html}</tr></tbody>`
  return table.querySelector('tr')!
}

describe('rowTapOpens', () => {
  it('opens from the row ground and a plain cell', () => {
    const tr = row('<td><span>12,281</span></td>')
    expect(rowTapOpens(tr, tr)).toBe(true)
    expect(rowTapOpens(tr.querySelector('span'), tr)).toBe(true)
  })

  it('leaves every control in the row to itself, and what is inside one', () => {
    const tr = row(
      '<td><input type="checkbox"></td><td><button><svg><path></path></svg></button></td>' +
        '<td><a href="#">8.2</a></td><td><select></select></td><td><label>x</label></td><td><span role="button">*</span></td>',
    )
    for (const selector of ['input', 'button', 'path', 'a', 'select', 'label', '[role="button"]']) {
      expect(rowTapOpens(tr.querySelector(selector), tr), selector).toBe(false)
    }
  })

  it('opens nothing at the end of a text selection, or from outside the row', () => {
    const tr = row('<td><span>Mount Adams</span></td>')
    expect(rowTapOpens(tr.querySelector('span'), tr, 'Mount')).toBe(false)
    expect(rowTapOpens(document.body, tr)).toBe(false)
    expect(rowTapOpens(null, tr)).toBe(false)
  })
})
