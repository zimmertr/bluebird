import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import PhoneFoot from './PhoneFoot'
import BottomSheet from './BottomSheet'
import { render, placeAt } from '../testSupport/render'
import { panelMessages } from '../testSupport/fixtures'
import { BLOCKED, DISABLED, MAP_FAB, MAP_FAB_SLOT, MAP_FAB_WORDS, MESSAGE_BADGE } from '../styles'
import type { FooterMessage } from '../utils/notices'

// The foot of a phone's map (#696): the Analyze button (record 0135),
// Material's extended floating action button, with the message badge at its
// corner, which opens the panel's messages as a bottom sheet (record 0208).
function foot(over: Partial<Parameters<typeof PhoneFoot>[0]> = {}) {
  return (
    <PhoneFoot
      fabBottomPx={120}
      onFabPx={() => {}}
      analyzeEnabled
      word="Analyze"
      onAnalyze={() => {}}
      messages={panelMessages()}
      {...over}
    />
  )
}
const MESSAGES: FooterMessage[] = [
  { key: 'blocker:types', text: 'Info line.', severity: 'info' },
  { key: 'cue:model-changed', text: 'First warning.', severity: 'warn' },
]
// The button's observer, fired by hand.
function stubResizeObserver() {
  const callbacks: (() => void)[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        callbacks.push(cb)
      }
      observe() {}
      disconnect() {}
    },
  )
  return () => callbacks.forEach((cb) => cb())
}
const button = () => screen.getByRole('button', { name: /^(Analyz|Try again)/ }) as HTMLButtonElement
const badge = () => screen.getByRole('button', { name: /^\d+ messages?$/ })

// In an afterEach so a failed assertion cannot leave the fake observer behind.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhoneFoot', () => {
  it('is lit while the gate is open, and runs the panel\'s command', () => {
    const onAnalyze = vi.fn()
    render(foot({ onAnalyze }))
    expect(button().disabled).toBe(false)
    expect(button().className).toBe(`${MAP_FAB} ${DISABLED} ${BLOCKED}`)
    // In a slot that places it, so the badge at its corner shares the place.
    expect(button().parentElement!.className).toBe(MAP_FAB_SLOT)
    // A phone's one Analyze is the tour's Analyze step (#536).
    expect(button().dataset.tour).toBe('analyze')
    fireEvent.click(button())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  // A full-screen results sheet stands over the button (#837): it stays
  // where it is and is out of reach until the sheet comes down. A drag on
  // the sheet moves it by `--sheet-shift`, as a transform.
  it('goes out of reach under a full-screen sheet, and rides a drag by transform', () => {
    const { rerender } = render(foot())
    const slot = () => button().parentElement!
    expect(slot().hasAttribute('inert')).toBe(false)
    expect(slot().style.transform).toBe('translateY(var(--sheet-shift, 0px))')
    rerender(foot({ covered: true }))
    expect(slot().hasAttribute('inert')).toBe(true)
    rerender(foot({ covered: false }))
    expect(slot().hasAttribute('inert')).toBe(false)
  })

  it('disables while busy, and reads the word it is handed', () => {
    const { rerender } = render(foot({ analyzeEnabled: false, word: 'Analyzing…' }))
    expect(button().disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Analyzing…' })).toBeTruthy()
    // After a failed run the one button is the retry (#736), on the same gate.
    rerender(foot({ word: 'Try again' }))
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(button().disabled).toBe(false)
  })

  // The width is the widest word's whichever is showing: every word stands
  // in one cell, the others invisible and out of the name.
  it('reserves the width of every word, and names itself by the one it shows', () => {
    const { rerender } = render(foot())
    const words = () => [...button().firstElementChild!.children] as HTMLElement[]
    expect(button().firstElementChild!.className).toBe(MAP_FAB_WORDS.cell)
    expect(words().map((w) => w.textContent)).toEqual(['Analyze', 'Analyzing…', 'Try again'])
    for (const hidden of words().slice(1)) {
      expect(hidden.className).toBe(MAP_FAB_WORDS.hidden)
      expect(hidden.getAttribute('aria-hidden')).toBe('true')
    }
    expect(button().textContent).toContain('Analyzing…')
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeTruthy()
    rerender(foot({ word: 'Analyzing…' }))
    expect(words().map((w) => w.textContent)).toEqual(['Analyzing…', 'Analyze', 'Try again'])
    rerender(foot({ word: 'Try again' }))
    expect(words().map((w) => w.textContent)).toEqual(['Try again', 'Analyze', 'Analyzing…'])
  })

  // Placed where it is told: the slot, not the button, since the badge rides
  // the same place.
  it('stands where it is told', () => {
    render(foot())
    expect(button().parentElement!.style.bottom).toBe('120px')
  })

  // The opened credit line stops short of the button, so its width is
  // reported.
  it('reports the button\'s width', () => {
    const fire = stubResizeObserver()
    const onFabPx = vi.fn()
    render(foot({ onFabPx }))
    placeAt(button(), { left: 254, top: 674, width: 120.1, height: 56 })
    act(() => fire())
    expect(onFabPx).toHaveBeenLastCalledWith(120.1)
  })

  // The badge on the button's corner opens the messages as a sheet headed
  // Messages, and the one live region beside the button holds every message
  // whether or not the sheet is up (record 0208).
  it('counts the messages on its corner, and opens them as a sheet headed Messages', () => {
    render(foot({ messages: panelMessages({ messages: MESSAGES }) }))
    expect(badge().textContent).toBe('2')
    expect(badge().className).toContain(MESSAGE_BADGE.warn)
    expect(badge().parentElement).toBe(button().parentElement)
    const region = screen.getByRole('status')
    expect(region.parentElement).toBe(button().parentElement)
    expect(region.textContent).toContain('First warning.')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(badge())
    const sheet = screen.getByRole('dialog', { name: 'Messages' })
    expect(within(sheet).getByRole('group', { name: 'Messages' })).toBeTruthy()
    expect(within(sheet).getByText('First warning.')).toBeTruthy()
    expect(within(sheet).getByText('Info line.')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // A blocker greys the button and leaves it live (the maintainer,
  // 2026-10-21): a press anywhere on it opens the sheet, and runs nothing.
  it('opens the sheet from a press on the greyed button while a blocker holds it', () => {
    const onAnalyze = vi.fn()
    const blocked = panelMessages({ messages: [MESSAGES[0]], analyzeEnabled: false, blocked: true })
    render(foot({ onAnalyze, analyzeEnabled: false, messages: blocked }))
    expect(button().disabled).toBe(false)
    expect(button().getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button())
    expect(onAnalyze).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeTruthy()
  })

  it('closes the sheet when the last message goes', () => {
    const { rerender } = render(foot({ messages: panelMessages({ messages: MESSAGES }) }))
    fireEvent.click(badge())
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeTruthy()
    rerender(foot())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /messages?$/ })).toBeNull()
  })

  // #803: a run that fails opens the sheet, as the panel's list opens at a
  // desk, once per failure; Done closes it as it always does.
  it('opens the sheet when a run fails, once per failure', () => {
    const { rerender } = render(foot({ messages: panelMessages({ messages: MESSAGES }) }))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(foot({ messages: panelMessages({ messages: MESSAGES, failureSeq: 1 }) }))
    const sheet = screen.getByRole('dialog', { name: 'Messages' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(foot({ messages: panelMessages({ messages: [...MESSAGES], failureSeq: 1 }) }))
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(foot({ messages: panelMessages({ messages: MESSAGES, failureSeq: 2 }) }))
    expect(screen.getByRole('dialog', { name: 'Messages' })).toBeTruthy()
  })

  // The tutorial's Messages card holds the sheet open (#786) and frames it
  // whole, and the sheet leaves the keyboard to the card, as the Layers sheet
  // does for its own.
  it('holds the sheet open for the tutorial under the anchor its card frames', () => {
    const { rerender } = render(foot({ messages: panelMessages({ messages: MESSAGES, held: true }) }))
    const sheet = screen.getByRole('dialog', { name: 'Messages' })
    expect(sheet.closest('[data-tour="messages-list"]')).not.toBeNull()
    rerender(foot({ messages: panelMessages({ messages: MESSAGES }) }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Every phone sheet opens over the button and leaves it alone (TJ,
  // 2026-10-21; record 0207): the same element where it stood, neither inert
  // nor greyed, while the sheet holds the keyboard. The sheet's dim and its
  // modality keep the button from a press, so nothing here has to.
  for (const controls of [false, true]) {
    it(`leaves the button as it was under ${controls ? 'the Controls sheet' : 'a menu sheet'}`, () => {
      function Page() {
        const [open, setOpen] = useState(false)
        const close = () => setOpen(false)
        const kept = { open, tourRuns: false, heightPx: 540, restPx: 540, fullPx: 660, onHeightPx: () => {} }
        return (
          <>
            {foot()}
            <button onClick={() => setOpen(true)}>Open</button>
            {controls ? (
              <BottomSheet heading="Controls" onClose={close} kept={kept}>
                <div>Destinations</div>
              </BottomSheet>
            ) : (
              open && (
                <BottomSheet heading="Layers" onClose={close}>
                  <div>Smoke</div>
                </BottomSheet>
              )
            )}
          </>
        )
      }
      render(<Page />)
      const fab = button()
      const asItWas = () => {
        expect(document.querySelector('[data-tour="analyze"]')).toBe(fab)
        expect(fab.hasAttribute('inert')).toBe(false)
        expect(fab.disabled).toBe(false)
        expect(fab.parentElement!.style.bottom).toBe('120px')
        expect(fab.className).toBe(`${MAP_FAB} ${DISABLED} ${BLOCKED}`)
      }
      asItWas()
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))
      const sheet = screen.getByRole('dialog', { name: controls ? 'Controls' : 'Layers' })
      expect(sheet.getAttribute('aria-modal')).toBe('true')
      expect(sheet.contains(document.activeElement)).toBe(true)
      asItWas()
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      asItWas()
    })
  }
})
