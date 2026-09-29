import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import Dim from './Dim'
import type { Box } from './place'

// The lit areas glide from one step's to the next's. A slow machine draws few
// frames and can stamp each one as if it came on time, so the glide has to
// run on the wall clock, or the light stands off the section it lights for
// seconds (#536).
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function frames() {
  let pending: FrameRequestCallback | null = null
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    pending = cb
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  return {
    // One frame after `ms` of wall time, stamped 16ms after the last.
    run(ms: number) {
      clock += ms
      const cb = pending
      pending = null
      act(() => cb?.(16))
    },
  }
}

const drawn = (el: HTMLElement) => JSON.parse(el.querySelector('[data-tour-dim]')!.getAttribute('data-holes') ?? '[]')

describe('Dim', () => {
  it('lands a light on its new target within a slow frame, whatever the frame says the time is', () => {
    const clock = frames()
    let target: Box = { left: 0, top: 80, right: 340, bottom: 290 }
    const { container } = render(<Dim holes={() => [target]} reduced={false} />)
    clock.run(16)
    expect(drawn(container)).toEqual([[0, 80, 340, 290]])
    target = { left: 0, top: 297, right: 340, bottom: 690 }
    clock.run(500)
    expect(drawn(container)).toEqual([[0, 297, 340, 690]])
  })

  it('glides part of the way in one quick frame, where motion is welcome', () => {
    const clock = frames()
    let target: Box = { left: 0, top: 0, right: 100, bottom: 100 }
    const { container } = render(<Dim holes={() => [target]} reduced={false} />)
    clock.run(16)
    target = { left: 0, top: 200, right: 100, bottom: 300 }
    clock.run(16)
    const [[, top]] = drawn(container)
    expect(top).toBeGreaterThan(0)
    expect(top).toBeLessThan(200)
  })
})
