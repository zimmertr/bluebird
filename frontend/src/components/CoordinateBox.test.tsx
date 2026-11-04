import { createRef, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import CoordinateBox from './CoordinateBox'
import { render } from '../testSupport/render'
import { COORD_BOX } from '../styles'

// The coordinates box (record 0265): the textarea and the gutter that
// numbers its lines and flags each one the parse drops.

type Props = ComponentProps<typeof CoordinateBox>

function props(over: Partial<Props> = {}): Props {
  return {
    value: '',
    onChange: () => {},
    placeholder: '# Lat,Lon',
    'aria-label': 'Custom destination coordinates',
    rows: 2,
    ...over,
  }
}

const box = () => screen.getByRole('textbox', { name: 'Custom destination coordinates' }) as HTMLTextAreaElement
// The gutter is hidden from a screen reader, so it is found beside the box.
const gutter = () => box().previousElementSibling as HTMLElement
const numbers = () => [...gutter().children].map((line) => line.textContent)
const flagged = () => [...gutter().children].filter((line) => line.className.includes(COORD_BOX.flagged)).map((l) => l.textContent)

describe('CoordinateBox', () => {
  it('numbers each line of the box, and the one line of a blank box', () => {
    const { rerender } = render(<CoordinateBox {...props()} />)
    expect(numbers()).toEqual(['1'])
    rerender(<CoordinateBox {...props({ value: '46.85,-121.76\n48.11,-121.11\n47,-120' })} />)
    expect(numbers()).toEqual(['1', '2', '3'])
    // A box ending in a newline shows an empty last line, and numbers it.
    rerender(<CoordinateBox {...props({ value: '46.85,-121.76\n' })} />)
    expect(numbers()).toEqual(['1', '2'])
  })

  it('hides the gutter from a screen reader and wraps no line', () => {
    render(<CoordinateBox {...props({ value: '46.85,-121.76' })} />)
    expect(gutter().getAttribute('aria-hidden')).toBe('true')
    expect(gutter().className).toBe(COORD_BOX.gutter)
    expect(box().getAttribute('wrap')).toBe('off')
    expect(box().className).toBe(COORD_BOX.area)
    expect(box().parentElement!.className).toBe(COORD_BOX.frame)
  })

  it('flags a line the parse drops, and no blank, comment or good line', () => {
    const value = ['# Lat,Lon', '46.85,-121.76,Rainier', '', 'Mount Baker', '95,-121', '   ', '47,-120'].join('\n')
    render(<CoordinateBox {...props({ value })} />)
    expect(flagged()).toEqual(['4', '5'])
    for (const line of gutter().children) expect(line.className).toContain(COORD_BOX.line)
  })

  it('flags nothing in a box that parses whole', () => {
    render(<CoordinateBox {...props({ value: '46.85,-121.76\n# a note\n\n47,-120' })} />)
    expect(flagged()).toEqual([])
  })

  it("keeps the gutter's scroll on the box's", () => {
    render(<CoordinateBox {...props({ value: Array.from({ length: 40 }, () => '47,-120').join('\n') })} />)
    box().scrollTop = 96
    fireEvent.scroll(box())
    expect(gutter().scrollTop).toBe(96)
    box().scrollTop = 0
    fireEvent.scroll(box())
    expect(gutter().scrollTop).toBe(0)
  })

  it('hands its ref the textarea and passes its handlers through', () => {
    const ref = createRef<HTMLTextAreaElement>()
    const onChange = vi.fn()
    const onPaste = vi.fn()
    const onKeyDown = vi.fn()
    render(<CoordinateBox {...props({ ref, onChange, onPaste, onKeyDown })} />)
    expect(ref.current).toBe(box())
    fireEvent.keyDown(box())
    fireEvent.paste(box())
    fireEvent.change(box(), { target: { value: '47,-120' } })
    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(onPaste).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })
})
