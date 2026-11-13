import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import BottomSheet, { type KeptSheet } from './BottomSheet'
import { DOUBLE_PRESS_MS } from '../utils/doublePress'
import { SHEET_SNAP_PX } from '../utils/sheetDrag'
import { BOTTOM_SHEET } from '../styles'
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
// The px a held sheet's share of the ceiling stands at, which its CSS works
// out on a real screen: the screen jsdom reports, as there is no status bar
// band. Null for its own height.
function shown(card: HTMLElement): number | null {
  const share = card.style.getPropertyValue('--sheet-share')
  return share ? Math.round(parseFloat(share) * window.innerHeight) : null
}

// The screen a drag measures its ceiling off, which jsdom leaves at 768.
const SCREEN_PX = 844
function stubScreen() {
  let before: number
  beforeEach(() => {
    before = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: SCREEN_PX })
  })
  afterEach(() => Object.defineProperty(window, 'innerHeight', { configurable: true, value: before }))
}

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
  // with none, and the screen is `SCREEN_PX` tall; the clock is the test's,
  // so a drag's speed is what the test says it is.
  describe('dragged', () => {
    afterEach(() => vi.useRealTimers())
    stubScreen()
    // The rows' own height under the cap they open at.
    const OWN_PX = 300
    function setup() {
      vi.useFakeTimers({ toFake: ['Date', 'performance'] })
      const onClose = sheet()
      const card = screen.getByRole('dialog')
      Object.defineProperty(card, 'offsetHeight', {
        configurable: true,
        get: () => shown(card) ?? OWN_PX,
      })
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
      expect(shown(card)).toBe(400)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('drags from the title row, and not from Done', () => {
      const { card, title, drag } = setup()
      drag(title, [400, 300])
      expect(shown(card)).toBe(500)
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Done' }), { clientY: 500, pointerId: 1 })
      fireEvent.pointerMove(document, { clientY: 100, pointerId: 1 })
      expect(shown(card)).toBe(500)
    })

    // Past the cap it opens at, to the screen's top (record 0290): the
    // ceiling every sheet shares, and no higher.
    it('rises past the cap it opens at to the top of the screen, and no higher', () => {
      const { card, drag } = setup()
      fireEvent.pointerDown(grip(), { clientY: 500, pointerId: 1 })
      vi.advanceTimersByTime(100)
      fireEvent.pointerMove(document, { clientY: -200, pointerId: 1 })
      expect(shown(card)).toBe(SCREEN_PX)
      fireEvent.pointerCancel(document, { pointerId: 1 })
      vi.advanceTimersByTime(DOUBLE_PRESS_MS)
      drag(grip(), [300, -200])
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.ceiling)
      expect(card.className.split(' ')).not.toContain(BOTTOM_SHEET.opening)
    })

    // Let go at the top it is full, a state its CSS sizes rather than a
    // number, so a phone turned on its side keeps the grip on the screen
    // (record 0290). A height between is held under the ceiling, which the
    // turned screen clamps.
    it('stays full by its CSS when let go at the top, and holds a height under the ceiling', () => {
      const { card, drag } = setup()
      drag(grip(), [300, -200])
      expect(shown(card)).toBeNull()
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.full)
      drag(grip(), [600, 800])
      expect(shown(card)).toBe(SCREEN_PX - 300)
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.ceiling)
      expect(card.className.split(' ')).not.toContain(BOTTOM_SHEET.full)
    })

    it('gives the sheet back its own height on a release near it, and on a double press', () => {
      const { card, drag } = setup()
      drag(grip(), [400, 300])
      expect(shown(card)).toBe(500)
      drag(grip(), [600, 700 - SHEET_SNAP_PX / 2])
      expect(shown(card)).toBeNull()
      drag(grip(), [400, 300])
      fireEvent.pointerDown(grip(), { clientY: 500, pointerId: 1 })
      vi.advanceTimersByTime(DOUBLE_PRESS_MS - 50)
      fireEvent.pointerDown(grip(), { clientY: 500, pointerId: 1 })
      expect(shown(card)).toBeNull()
    })

    // A held sheet is a share of the ceiling, which its CSS sizes (record
    // 0290): turned to a screen 390px tall, a sheet held at 450 of 844 stands
    // at the same share of 390, and a drag there starts from it.
    it('holds a share of the ceiling, which a turned screen keeps', () => {
      const { card, drag } = setup()
      drag(grip(), [480, 350])
      expect(parseFloat(card.style.getPropertyValue('--sheet-share'))).toBeCloseTo(450 / SCREEN_PX)
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.held)
      expect(card.style.height).toBe('')
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 })
      expect(shown(card)).toBe(Math.round((450 / SCREEN_PX) * 390))
      drag(grip(), [490, 480], 200)
      expect(shown(card)).toBe(Math.round((450 / SCREEN_PX) * 390) + 20)
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

  // The Controls sheet (record 0207): the same shape, kept mounted, and modal
  // only while open.
  describe('kept', () => {
    stubScreen()
    const KEPT: KeptSheet = { open: true, tourRuns: false, held: null, restPx: 540, onHeld: () => {} }
    function kept(open: boolean, onClose = vi.fn()) {
      return (
        <div data-testid="home">
          <BottomSheet heading="Controls" onClose={onClose} kept={{ ...KEPT, open }}>
            <input aria-label="Field" />
          </BottomSheet>
        </div>
      )
    }

    it('renders in place at the height it is handed, over its own dim while open', () => {
      const { rerender } = render(kept(true))
      const dialog = screen.getByRole('dialog', { name: 'Controls' })
      expect(dialog.parentElement).toBe(screen.getByTestId('home'))
      expect(dialog.style.height).toBe('540px')
      expect(dialog.previousElementSibling?.getAttribute('aria-hidden')).toBe('true')
      rerender(kept(false))
      expect(dialog.previousElementSibling).toBeNull()
      expect(dialog.hasAttribute('inert')).toBe(true)
      expect(screen.getByRole('textbox', { hidden: true })).toBeTruthy()
    })

    // The same ceiling as a menu sheet's (record 0290): the screen less the
    // status bar's band, where it used to stop under the chips and the
    // Analyze button's strip.
    it('rises under its grip to the top of the screen, under the status bar\'s band', () => {
      vi.useFakeTimers({ toFake: ['Date', 'performance'] })
      const onHeld = vi.fn()
      render(
        <BottomSheet heading="Controls" onClose={vi.fn()} kept={{ ...KEPT, onHeld }}>
          <input aria-label="Field" />
        </BottomSheet>,
      )
      const card = screen.getByRole('dialog', { name: 'Controls' })
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.ceiling)
      Object.defineProperty(card, 'offsetHeight', { configurable: true, value: KEPT.restPx })
      const band = card.lastElementChild as HTMLElement
      Object.defineProperty(band, 'offsetHeight', { configurable: true, value: 47 })
      fireEvent.pointerDown(grip(), { clientY: 500, pointerId: 1 })
      vi.advanceTimersByTime(100)
      fireEvent.pointerMove(document, { clientY: -500, pointerId: 1 })
      expect(onHeld).toHaveBeenLastCalledWith({ share: 1 })
      vi.advanceTimersByTime(200)
      fireEvent.pointerMove(document, { clientY: -500, pointerId: 1 })
      vi.advanceTimersByTime(200)
      fireEvent.pointerUp(document, { clientY: -500, pointerId: 1 })
      expect(onHeld).toHaveBeenLastCalledWith('full')
      vi.useRealTimers()
    })

    // A held share is of the ceiling rather than of the own height its
    // caller hands it, so a turned screen that shrinks the map's strip leaves
    // it where it was (record 0290).
    it('stands at its held share of the ceiling, whatever own height it is handed', () => {
      const { rerender } = render(
        <BottomSheet heading="Controls" onClose={vi.fn()} kept={{ ...KEPT, held: { share: 0.7 } }}>
          <input aria-label="Field" />
        </BottomSheet>,
      )
      const card = screen.getByRole('dialog', { name: 'Controls' })
      expect(card.style.getPropertyValue('--sheet-share')).toBe('0.7')
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.held)
      expect(card.style.height).toBe('')
      rerender(
        <BottomSheet heading="Controls" onClose={vi.fn()} kept={{ ...KEPT, restPx: 200, held: { share: 0.7 } }}>
          <input aria-label="Field" />
        </BottomSheet>,
      )
      expect(card.style.getPropertyValue('--sheet-share')).toBe('0.7')
      expect(card.style.height).toBe('')
    })

    it('stands full by its CSS when its caller holds it full', () => {
      render(
        <BottomSheet heading="Controls" onClose={vi.fn()} kept={{ ...KEPT, held: 'full' }}>
          <input aria-label="Field" />
        </BottomSheet>,
      )
      const card = screen.getByRole('dialog', { name: 'Controls' })
      expect(card.style.height).toBe('')
      expect(card.className.split(' ')).toContain(BOTTOM_SHEET.full)
    })

    // A sheet opened from inside it, the model list or the calendar, stands
    // over it: Escape closes that one alone, and then the Controls sheet.
    it('answers no key while a sheet opened from inside it is up', () => {
      const onClose = vi.fn()
      function Page() {
        const [inner, setInner] = useState(false)
        return (
          <BottomSheet heading="Controls" onClose={onClose} kept={KEPT}>
            <button onClick={() => setInner(true)}>Model</button>
            {inner && (
              <BottomSheet heading="Model" onClose={() => setInner(false)}>
                <div>NOAA GFS</div>
              </BottomSheet>
            )}
          </BottomSheet>
        )
      }
      render(<Page />)
      const opener = screen.getByRole('button', { name: 'Model' })
      fireEvent.click(opener)
      expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Model' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Model' })).toBeNull()
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
