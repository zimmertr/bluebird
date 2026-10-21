import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import PhoneFoot from './PhoneFoot'
import BottomSheet from './BottomSheet'
import { render, placeAt, stubResizeObserver } from '../testSupport/render'
import { DISABLED, MAP_FAB, MAP_FAB_WORDS } from '../styles'

// The foot of a phone's map (#696): the notice band (record 0140) and the
// Analyze button (record 0135), Material's extended floating action button.
function foot(over: Partial<Parameters<typeof PhoneFoot>[0]> = {}) {
  return (
    <PhoneFoot
      bandBottomPx={143}
      fabBottomPx={120}
      onNoticeBand={() => {}}
      onBandPx={() => {}}
      analyzeEnabled
      word="Analyze"
      onAnalyze={() => {}}
      {...over}
    />
  )
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

  // Placed where it is told, the band too: `MapStage` stands it over the
  // credit line (`noticeBottomPx`).
  it('stands the button and the band where they are told', () => {
    const onNoticeBand = vi.fn()
    render(foot({ onNoticeBand }))
    expect(button().style.bottom).toBe('120px')
    const band = onNoticeBand.mock.lastCall![0] as HTMLElement
    expect(band.style.bottom).toBe('143px')
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

  // Material's rule for a floating button under a modal sheet: it hides under
  // the dim while any sheet is open, and comes back when the sheet closes.
  it('hides while a bottom sheet is open, and comes back when it closes', () => {
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <>
          {foot()}
          <button onClick={() => setOpen(true)}>Layers</button>
          {open && (
            <BottomSheet heading="Layers" onClose={() => setOpen(false)}>
              <div>Smoke</div>
            </BottomSheet>
          )}
        </>
      )
    }
    render(<Page />)
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeTruthy()
  })
})
