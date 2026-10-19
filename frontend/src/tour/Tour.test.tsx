import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import Tour from './Tour'
import { spotlight, spotPad, spotRadius } from './place'
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

// A frame queue the test runs by hand, so the follow loop can be counted.
function frames() {
  const queue = new Map<number, FrameRequestCallback>()
  let next = 1
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
        act(() => cb(0))
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

  // The root's attribute hides every scroll shadow while a tour runs (#696).
  it('marks the page as touring while it runs', () => {
    const { unmount } = tour(0)
    expect(document.documentElement.hasAttribute('data-touring')).toBe(true)
    unmount()
    expect(document.documentElement.hasAttribute('data-touring')).toBe(false)
  })
})
