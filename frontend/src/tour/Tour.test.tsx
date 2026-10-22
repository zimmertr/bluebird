import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import Tour from './Tour'
import { GLIDE_FRAME_MS, GLIDE_MS, spotlight, spotPad, spotRadius } from './place'
import { placeAt, render } from '../testSupport/render'
import { anchorSelector, TOUR_ATTR, TOUR_STEPS } from '../utils/tourSteps'

// The overlay itself, rendered (#536). `Tour.test.ts` keeps the source checks
// jsdom cannot make (no call scrolls an ancestor, which needs a page that
// lays out); this file drives the keys, the card and the light.

const ANALYZE = TOUR_STEPS.findIndex((s) => s.anchor === 'analyze')

function tour(index: number) {
  const handlers = { onNext: vi.fn(), onPrev: vi.fn(), onEnd: vi.fn() }
  const view = render(<Tour steps={TOUR_STEPS} index={index} {...handlers} />)
  return { ...handlers, ...view }
}

const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document, { key, ...init })
const button = (name: string) => screen.getByRole('button', { name })

// A frame queue the test runs by hand, so the follow loop can be counted;
// each frame's timestamp is `ms` after the last one's.
function frames(ms = 0) {
  const queue = new Map<number, FrameRequestCallback>()
  let next = 1
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(next, cb)
    return next++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  return {
    get pending() {
      return queue.size
    },
    /** Every queued frame and every frame those queue; how many ran. */
    drain(cap = 100): number {
      let ran = 0
      while (queue.size > 0 && ran < cap) {
        const [id, cb] = queue.entries().next().value!
        queue.delete(id)
        act(() => cb(now))
        now += ms
        ran++
      }
      return ran
    },
  }
}

// The step's control, placed and rounded the way the phone's Analyze button
// is. The four longhands, because jsdom does not expand the shorthand for
// getComputedStyle and would read the corners as square.
function anchor(name: string, box = { left: 10, top: 20, width: 100, height: 40 }, radius = '16px'): HTMLElement {
  const el = document.createElement('button')
  el.setAttribute(TOUR_ATTR, name)
  for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const) {
    el.style[`border${corner}Radius`] = radius
  }
  document.body.appendChild(el)
  placeAt(el, box)
  return el
}

afterEach(() => {
  for (const el of document.querySelectorAll(anchorSelector('analyze'))) el.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Tour', () => {
  it('walks on the keys, and leaves Enter on a card button to the button', () => {
    const { onNext, onPrev, onEnd } = tour(1)
    press('ArrowRight')
    expect(onNext).toHaveBeenCalledTimes(1)
    // Focus outside the card: Enter and Space walk on.
    act(() => (document.activeElement as HTMLElement).blur())
    press('Enter')
    press(' ')
    expect(onNext).toHaveBeenCalledTimes(3)
    for (const key of ['ArrowLeft', 'Backspace', 'Delete']) press(key)
    expect(onPrev).toHaveBeenCalledTimes(3)
    // On Previous, Enter is Previous's own click, so the keydown walks nowhere.
    act(() => button('Previous').focus())
    press('Enter')
    expect(onNext).toHaveBeenCalledTimes(3)
    expect(onPrev).toHaveBeenCalledTimes(3)
    press('Escape')
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the card, both ways', () => {
    tour(1)
    const [first, last] = [button('End tutorial'), button('Next')]
    act(() => last.focus())
    expect(press('Tab')).toBe(false)
    expect(document.activeElement).toBe(first)
    expect(press('Tab', { shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(last)
  })

  it('counts the cards, offers Previous after the first, and ends on Done', () => {
    const { unmount } = tour(0)
    expect(screen.getByText(`1 of ${TOUR_STEPS.length}`)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull()
    expect(document.activeElement).toBe(button('Next'))
    unmount()

    const lastStep = tour(TOUR_STEPS.length - 1)
    expect(screen.getByText(`${TOUR_STEPS.length} of ${TOUR_STEPS.length}`)).toBeTruthy()
    fireEvent.click(button('Done'))
    expect(lastStep.onEnd).toHaveBeenCalledTimes(1)
    expect(lastStep.onNext).not.toHaveBeenCalled()
  })

  // Every focus call passes preventScroll and nothing is scrolled into view,
  // as far as jsdom can see; whether an ancestor moved is the source check's.
  it('takes the focus without scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView')
    tour(1)
    expect(focus).toHaveBeenCalled()
    for (const [options] of focus.mock.calls) expect(options).toEqual({ preventScroll: true })
    expect(scrolled).not.toHaveBeenCalled()
  })

  // The light frames the control padded and rounded off its own corners
  // (record 0151), and follows it a frame at a time only until it holds still
  // (#696): ten still frames after the first, then nothing until a scroll or a
  // resize wakes it.
  it('lights the control and follows it until it holds still', () => {
    const queue = frames()
    const box = { left: 10, top: 20, width: 100, height: 40 }
    anchor('analyze', box)
    const { container } = tour(ANALYZE)
    const step = TOUR_STEPS[ANALYZE]
    const pad = spotPad(step.spot, 16)
    const light = (container.firstElementChild!.firstElementChild as HTMLElement).style
    const want = spotlight(box, pad)
    expect([light.top, light.left, light.width, light.height]).toEqual(
      [want.top, want.left, want.width, want.height].map((v) => `${v}px`),
    )
    expect(light.borderRadius).toBe(`${spotRadius(16, pad)}px`)
    expect(queue.pending).toBe(1)
    expect(queue.drain()).toBe(11)
    expect(queue.pending).toBe(0)
    act(() => void document.dispatchEvent(new Event('scroll')))
    expect(queue.pending).toBe(1)
    queue.drain()
    act(() => void window.dispatchEvent(new Event('resize')))
    expect(queue.pending).toBe(1)
  })

  // A step change glides the light from where it stood to the new control
  // over a quarter second of frames, and the loop runs until it lands
  // (#786); under a reduced-motion setting it stands there at once.
  describe('between two steps', () => {
    const NEXT = ANALYZE + 1
    const first = { left: 10, top: 20, width: 100, height: 40 }
    const second = { left: 10, top: 600, width: 300, height: 60 }

    function walk(cut = false) {
      const queue = frames(GLIDE_FRAME_MS)
      anchor('analyze', first)
      anchor(TOUR_STEPS[NEXT].anchor, second, '0px')
      const handlers = { onNext: vi.fn(), onPrev: vi.fn(), onEnd: vi.fn(), cut }
      const view = render(<Tour steps={TOUR_STEPS} index={ANALYZE} {...handlers} />)
      queue.drain()
      const light = (view.container.firstElementChild!.firstElementChild as HTMLElement).style
      const top = () => parseFloat(light.top)
      view.rerender(<Tour steps={TOUR_STEPS} index={NEXT} {...handlers} />)
      return { queue, top }
    }
    const from = spotlight(first, spotPad(TOUR_STEPS[ANALYZE].spot, 16)).top
    const to = spotlight(second, spotPad(TOUR_STEPS[NEXT].spot, 0)).top

    afterEach(() => {
      for (const el of document.querySelectorAll(anchorSelector(TOUR_STEPS[NEXT].anchor))) el.remove()
    })

    it('glides from the last control to the next and stops once it lands', () => {
      const { queue, top } = walk()
      expect(top()).toBe(from)
      const seen: number[] = []
      for (let i = 0; i < 4; i++) {
        queue.drain(1)
        seen.push(top())
      }
      // Every frame further on, none of them there yet.
      expect(seen).toEqual([...seen].sort((a, b) => a - b))
      expect(new Set(seen).size).toBeGreaterThan(2)
      expect(Math.max(...seen)).toBeLessThan(to)
      // It lands within its quarter second of frames and then holds still.
      expect(queue.drain()).toBeLessThan(Math.ceil(GLIDE_MS / GLIDE_FRAME_MS) + 12)
      expect(top()).toBe(to)
      expect(queue.pending).toBe(0)
    })

    it('stands at the next control at once under a reduced-motion setting', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
      const { top } = walk()
      expect(top()).toBe(to)
    })

    // A phone's tour cuts (#786): the light stands at the next control in
    // the commit that shows its card, and the root says so for the
    // stylesheet, which stands every transition down.
    it('cuts to the next control where the tour cuts', () => {
      const { top } = walk(true)
      expect(top()).toBe(to)
      expect(document.documentElement.getAttribute('data-touring')).toBe('cut')
    })
  })

  // The panel moves to a control below its fold smoothly at a desk, where
  // the reader sees the column move, and jumps there where the tour cuts
  // (#786).
  it('scrolls the panel smoothly, or jumps it where the tour cuts', () => {
    frames()
    const panel = document.body.appendChild(document.createElement('div'))
    panel.style.overflowY = 'auto'
    Object.defineProperty(panel, 'scrollHeight', { value: 2000 })
    Object.defineProperty(panel, 'clientHeight', { value: 500 })
    placeAt(panel, { left: 0, top: 0, width: 360, height: 500 })
    const control = anchor('analyze', { left: 10, top: 900, width: 100, height: 40 })
    panel.appendChild(control)
    const scrollTo = vi.fn()
    panel.scrollTo = scrollTo as typeof panel.scrollTo
    const behaviors = [false, true].map((cut) => {
      scrollTo.mockClear()
      const { unmount } = render(<Tour steps={TOUR_STEPS} index={ANALYZE} onNext={vi.fn()} onPrev={vi.fn()} onEnd={vi.fn()} cut={cut} />)
      unmount()
      return scrollTo.mock.calls[0]?.[0]?.behavior
    })
    panel.remove()
    expect(behaviors).toEqual(['smooth', 'instant'])
  })

  // The root's attribute hides every scroll shadow while a tour runs (#696).
  it('marks the page as touring while it runs', () => {
    const { unmount } = tour(0)
    expect(document.documentElement.getAttribute('data-touring')).toBe('')
    unmount()
    expect(document.documentElement.hasAttribute('data-touring')).toBe(false)
  })
})
