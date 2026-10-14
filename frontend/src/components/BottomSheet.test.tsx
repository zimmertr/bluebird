import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import BottomSheet, { SWIPE_CLOSE_PX } from './BottomSheet'
import { render } from '../testSupport/render'

// A phone's one menu shape (#696; record 0136): a modal card from the bottom
// edge, named by its heading, which Done, Escape, a press on the dimmed map
// and a swipe down its grip all close.
function sheet(onClose = vi.fn()) {
  render(
    <>
      <button>Layers</button>
      <BottomSheet heading="Layers" onClose={onClose} outside={<span data-testid="outside" />}>
        <label>
          <input type="checkbox" />
          Smoke
        </label>
      </BottomSheet>
    </>,
  )
  return onClose
}
const grip = () => screen.getByRole('dialog').firstElementChild as HTMLElement

describe('BottomSheet', () => {
  it('is a modal dialog named by its heading, at the end of the body', () => {
    sheet()
    const dialog = screen.getByRole('dialog', { name: 'Layers' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByRole('heading', { name: 'Layers' })).toBeTruthy()
  })

  // `useDialog` takes the keyboard into the card as it opens.
  it('takes the keyboard into the card', () => {
    sheet()
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('closes on Done and on Escape', async () => {
    const onClose = sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  // The dim catches a press outside the card; a press inside the card is
  // the card's.
  it('closes on a press on the dimmed map and not on one inside the card', () => {
    const onClose = sheet()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onClose).not.toHaveBeenCalled()
    const scrim = screen.getByRole('dialog').previousElementSibling as HTMLElement
    expect(scrim.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalledOnce()
  })

  // A slip of the thumb is not a swipe; a drag past the threshold is.
  it('closes on a swipe down the grip past its threshold, and not on a slip', () => {
    const onClose = sheet()
    const g = grip()
    g.setPointerCapture = () => {}
    fireEvent.pointerDown(g, { clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(g, { clientY: 500 + SWIPE_CLOSE_PX - 1, pointerId: 1 })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(g, { clientY: 500, pointerId: 1 })
    fireEvent.pointerUp(g, { clientY: 500 + SWIPE_CLOSE_PX, pointerId: 1 })
    expect(onClose).toHaveBeenCalledOnce()
  })

  // What the sheet holds beside its rows stays out of the scrolling body, so
  // it takes no row's height and no rule.
  it('holds its outside content beside the rows rather than among them', () => {
    sheet()
    const outside = screen.getByTestId('outside')
    expect(outside.parentElement).toBe(screen.getByRole('dialog'))
    expect(screen.getByRole('checkbox').closest('label')!.parentElement).not.toBe(outside.parentElement)
  })
})
