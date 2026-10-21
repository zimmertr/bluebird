import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import PhoneFoot from './PhoneFoot'
import BottomSheet from './BottomSheet'
import { render, placeAt } from '../testSupport/render'
import { DISABLED, MAP_FAB, MAP_FAB_WORDS, MAP_NOTICE_BAND } from '../styles'
import { CORNER_MARGIN_PX } from '../utils/resultsSheet'

// The foot of a phone's map (#696): the notice band (record 0140) and the
// Analyze button (record 0135), Material's extended floating action button.
function foot(over: Partial<Parameters<typeof PhoneFoot>[0]> = {}) {
  return (
    <PhoneFoot
      liftPx={104}
      controlsOpen={false}
      fabBottomPx={120}
      onNoticeBand={() => {}}
      onBandPx={() => {}}
      onFabPx={() => {}}
      analyzeEnabled
      word="Analyze"
      onAnalyze={() => {}}
      {...over}
    />
  )
}
// Every observer the foot starts (the band's and the button's), fired at once.
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

// In an afterEach so a failed assertion cannot leave the fake observer behind.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PhoneFoot', () => {
  it('is lit while the gate is open, and runs the panel\'s command', () => {
    const onAnalyze = vi.fn()
    render(foot({ onAnalyze }))
    expect(button().disabled).toBe(false)
    expect(button().className).toBe(`${MAP_FAB} ${DISABLED}`)
    // A phone's one Analyze is the tour's Analyze step (#536).
    expect(button().dataset.tour).toBe('analyze')
    fireEvent.click(button())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('greys while the gate is shut, and reads the word it is handed', () => {
    const { rerender } = render(foot({ analyzeEnabled: false }))
    expect(button().disabled).toBe(true)
    rerender(foot({ analyzeEnabled: false, word: 'Analyzing…' }))
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

  // Placed where it is told, and the band just above the scale and credit.
  it('stands the button where it is told and the band on the sheet\'s edge', () => {
    const onNoticeBand = vi.fn()
    render(foot({ onNoticeBand }))
    expect(button().style.bottom).toBe('120px')
    const band = onNoticeBand.mock.lastCall![0] as HTMLElement
    expect(band.style.bottom).toBe(`${104 + CORNER_MARGIN_PX}px`)
    expect(band.className).toBe(MAP_NOTICE_BAND.map)
  })

  // The Controls sheet opens over the foot (record 0207): the band rides its
  // edge over the dim, on the panel's layer, and the button is left as it was.
  it('stands the band over the Controls sheet\'s dim and leaves the button as it was', () => {
    const onNoticeBand = vi.fn()
    const { rerender } = render(foot({ onNoticeBand }))
    const band = onNoticeBand.mock.lastCall![0] as HTMLElement
    const fab = button()
    rerender(foot({ onNoticeBand, controlsOpen: true, liftPx: 540 }))
    expect(onNoticeBand.mock.lastCall![0]).toBe(band)
    expect(band.className).toBe(MAP_NOTICE_BAND.overDim)
    expect(band.style.bottom).toBe(`${540 + CORNER_MARGIN_PX}px`)
    expect(fab.isConnected).toBe(true)
    expect(fab.hasAttribute('inert')).toBe(false)
    expect(fab.style.bottom).toBe('120px')
    rerender(foot({ onNoticeBand }))
    expect(band.className).toBe(MAP_NOTICE_BAND.map)
    expect(button()).toBe(fab)
  })

  // The band's height is what the button rises by, so it is reported, and
  // reported again when what the band holds changes size.
  it('reports the band\'s height as it changes', () => {
    const fire = stubResizeObserver()
    const onBandPx = vi.fn()
    const onNoticeBand = vi.fn()
    render(foot({ onBandPx, onNoticeBand }))
    expect(onBandPx).toHaveBeenLastCalledWith(0)
    const band = onNoticeBand.mock.lastCall![0] as HTMLElement
    placeAt(band, { left: 12, top: 600, width: 366, height: 52 })
    act(() => fire())
    expect(onBandPx).toHaveBeenLastCalledWith(52)
  })

  // While the Controls sheet is up the band rides its edge, so its height no
  // longer moves the button: a cue that arrives then is reported when the
  // sheet shuts and the band is back at the foot (record 0207).
  it('holds the band\'s height while the Controls sheet is up, and reports it as it shuts', () => {
    const fire = stubResizeObserver()
    const onBandPx = vi.fn()
    const onNoticeBand = vi.fn()
    const { rerender } = render(foot({ onBandPx, onNoticeBand, controlsOpen: true }))
    expect(onBandPx).not.toHaveBeenCalled()
    const band = onNoticeBand.mock.lastCall![0] as HTMLElement
    placeAt(band, { left: 12, top: 180, width: 366, height: 62 })
    act(() => fire())
    expect(onBandPx).not.toHaveBeenCalled()
    rerender(foot({ onBandPx, onNoticeBand }))
    expect(onBandPx).toHaveBeenLastCalledWith(62)
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
            {foot({ controlsOpen: controls && open })}
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
        expect(fab.style.bottom).toBe('120px')
        expect(fab.className).toBe(`${MAP_FAB} ${DISABLED}`)
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
