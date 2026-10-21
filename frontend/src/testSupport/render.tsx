import type { ReactElement } from 'react'
import { render as renderDom, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// What every component test starts from: the rendered tree and a user to drive
// it. One helper so that every suite drives the page the same way, and a change
// to how events are simulated (a pointer option, a delay) is one edit.
//
// `userEvent.setup()` before the render rather than the bare `userEvent.click`
// calls, because a set-up user keeps one keyboard and one pointer across the
// whole test: a held Shift or a pressed button carries into the next action the
// way it does for a real reader.
export function render(ui: ReactElement, options?: RenderOptions) {
  const user = userEvent.setup()
  return { user, ...renderDom(ui, options) }
}

/** A layout box, in the shape `getBoundingClientRect` answers with. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Give one element a place on the page.
 *
 * jsdom lays nothing out, so every element measures as a zero box at the
 * origin. A test of placement or of a drag needs the few boxes it reads to be
 * somewhere, and says where here rather than stubbing layout for the page.
 */
export function placeAt(el: Element, { left, top, width, height }: Box): void {
  const rect = {
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
  }
  el.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect
}

/**
 * Stand in for `ResizeObserver`, which jsdom lacks, and hand back a call that
 * fires every observer started since, at once. A component that measures
 * itself reports on the fire, after `placeAt` has moved the boxes it reads.
 * The caller unstubs it (`vi.unstubAllGlobals`) in an `afterEach`, so a failed
 * assertion cannot leave it behind.
 */
export function stubResizeObserver(): () => void {
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
