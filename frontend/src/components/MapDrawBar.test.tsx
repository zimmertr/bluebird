import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MapDrawBar from './MapDrawBar'
import { DRAW_BAR, SENTENCE_BAR } from '../styles'
import { render } from '../testSupport/render'

// The draw bar: Done and Cancel on the map while a ring is drawn, across the
// map on a phone and in the cards' slot at a desk (record 0309).
describe('MapDrawBar', () => {
  it('holds Done until the ring is a polygon, and wires both presses', () => {
    const onDone = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(<MapDrawBar drawPointCount={2} onDone={onDone} onCancel={onCancel} />)
    const done = screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement
    expect(done.disabled).toBe(true)
    rerender(<MapDrawBar drawPointCount={3} onDone={onDone} onCancel={onCancel} />)
    fireEvent.click(done)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('hangs in the cards’ slot at a desk rather than across the map', () => {
    const { container, rerender } = render(<MapDrawBar drawPointCount={0} onDone={() => {}} onCancel={() => {}} />)
    const bar = () => container.firstElementChild as HTMLElement
    expect(bar().className).toContain(DRAW_BAR)
    rerender(<MapDrawBar inline drawPointCount={0} onDone={() => {}} onCancel={() => {}} />)
    expect(bar().className).toBe(SENTENCE_BAR.drawBar)
  })
})
