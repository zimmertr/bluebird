import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import BottomSheet from './BottomSheet'
import { DOUBLE_PRESS_MS } from '../hooks/useGripDrag'
import { SHEET_SNAP_PX } from '../utils/sheetDrag'
import { render } from '../testSupport/render'

// A phone's one menu shape (#696; record 0136): a modal card from the bottom
// edge, named by its heading, which Done, Escape, a press on the dimmed map
// and a grip let go closed all close.
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

  // The title row's slot beside Done is the Controls sheet's alone (#706):
  // a menu sheet's row is its title and Done, as it was.
  it('keeps a menu sheet\'s title row to its title and Done', () => {
    sheet()
    const done = screen.getByRole('button', { name: 'Done' })
    expect(done.parentElement!.querySelectorAll('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /theme/ })).toBeNull()
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

  // Done is the card's first stop and the checkbox its last, so Tab wraps
  // between them; Enter in a field is the field's, not a close.
  it('keeps Tab inside the sheet, both ways', () => {
    const onClose = sheet()
    const done = screen.getByRole('button', { name: 'Done' })
    const box = screen.getByRole('checkbox')
    box.focus()
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(done)
    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(box)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
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

  // The grip and the title row drag the sheet (#696; record 0146). jsdom lays
  // nothing out, so the card reports the height it is held at, 300px of rows
  // with none, and its cap is spelled inline; the clock is the test's, so a
  // drag's speed is what the test says it is.
  describe('dragged', () => {
    afterEach(() => vi.useRealTimers())
    function setup() {
      vi.useFakeTimers({ toFake: ['Date', 'performance'] })
      const onClose = sheet()
      const card = screen.getByRole('dialog')
      Object.defineProperty(card, 'offsetHeight', {
        configurable: true,
        get: () => (card.style.height ? parseFloat(card.style.height) : 300),
      })
      card.style.maxHeight = '740px'
      const title = screen.getByRole('heading', { name: 'Layers' })
      // A press, a move every 100ms, and the release where the last move was.
      const drag = (el: HTMLElement, ys: number[], stepMs = 100) => {
        fireEvent.pointerDown(el, { clientY: 500, pointerId: 1 })
        for (const y of ys) {
          vi.advanceTimersByTime(stepMs)
          fireEvent.pointerMove(document, { clientY: y, pointerId: 1 })
        }
        vi.advanceTimersByTime(stepMs)
        fireEvent.pointerUp(document, { clientY: ys[ys.length - 1], pointerId: 1 })
        vi.advanceTimersByTime(DOUBLE_PRESS_MS)
      }
      return { onClose, card, title, drag }
    }

    it('follows the finger and holds where it is let go', () => {
      const { onClose, card, drag } = setup()
      drag(grip(), [450, 400])
      expect(card.style.height).toBe('400px')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('drags from the title row, and not from Done', () => {
      const { card, title, drag } = setup()
      drag(title, [400, 300])
      expect(card.style.height).toBe('500px')
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Done' }), { clientY: 500, pointerId: 1 })
      fireEvent.pointerMove(document, { clientY: 100, pointerId: 1 })
      expect(card.style.height).toBe('500px')
    })

    it('rises no higher than its cap, and takes a release near it there', () => {
      const { card, drag } = setup()
      drag(grip(), [300, 0])
      expect(card.style.height).toBe('740px')
    })

    it('gives the sheet back its own height on a release near it, and on a double press', () => {
      const { card, drag } = setup()
      drag(grip(), [400, 300])
      expect(card.style.height).toBe('500px')
      drag(grip(), [600, 700 - SHEET_SNAP_PX / 2])
      expect(card.style.height).toBe('')
      drag(grip(), [400, 300])
      fireEvent.pointerDown(grip(), { clientY: 500, pointerId: 1 })
      vi.advanceTimersByTime(DOUBLE_PRESS_MS - 50)
      fireEvent.pointerDown(grip(), { clientY: 500, pointerId: 1 })
      expect(card.style.height).toBe('')
    })

    it('closes when let go near the foot', () => {
      const first = setup()
      first.drag(grip(), [600, 800 - SHEET_SNAP_PX])
      expect(first.onClose).toHaveBeenCalledOnce()
    })

    it('closes on a flick down', () => {
      const { onClose, drag } = setup()
      drag(grip(), [520, 560], 20)
      expect(onClose).toHaveBeenCalledOnce()
    })
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
