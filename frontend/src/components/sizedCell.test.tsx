import { describe, expect, it } from 'vitest'
import { render } from '../testSupport/render'
import { sized } from './sizedCell'

const wrapper = (ui: ReturnType<typeof sized>) =>
  render(<div>{ui}</div>).container.querySelector<HTMLElement>('[data-col-inner]')!

describe('sized', () => {
  it('pins a sized column to its width and clips what overflows', () => {
    const el = wrapper(sized({ name: 120 }, 'name', 'Mount Rainier'))
    expect(el.style.width).toBe('120px')
    expect(el.className).toBe('overflow-hidden text-ellipsis')
    expect(el.textContent).toBe('Mount Rainier')
  })

  it('leaves an unsized column inert, but still draws the wrapper auto-fit measures', () => {
    const el = wrapper(sized({}, 'name', 'Mount Rainier'))
    expect(el.style.width).toBe('')
    expect(el.getAttribute('class')).toBeNull()
  })

  it('flows inline for a header, so the sort arrow sits beside it', () => {
    expect(wrapper(sized({}, 'name', 'Name', 'inline')).className).toBe('inline-block align-bottom')
    expect(wrapper(sized({ name: 90 }, 'name', 'Name', 'inline')).className).toBe(
      'overflow-hidden text-ellipsis inline-block align-bottom',
    )
  })
})
