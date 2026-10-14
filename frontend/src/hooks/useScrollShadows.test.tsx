import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '../testSupport/render'

// jsdom lays nothing out, so each test says how tall the box and its content
// are and where it is scrolled to, the three numbers the hook reads.
function size(el: HTMLElement, { client, content, top }: { client: number; content: number; top: number }) {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: client })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: content })
  el.scrollTop = top
}

// The hook reads `CSS.supports` once, when it is imported, and jsdom answers
// true to anything; each test says which browser it is in before importing.
async function renderBox(
  dims: { client: number; content: number; top: number },
  scrollTimeline = false,
) {
  vi.stubGlobal('CSS', { supports: (q: string) => scrollTimeline && q === 'animation-timeline: scroll()' })
  const { useScrollShadows } = await import('./useScrollShadows')
  function Box() {
    const ref = useRef<HTMLDivElement>(null)
    useScrollShadows(ref)
    return (
      <div
        data-testid="box"
        ref={(el) => {
          if (el) size(el, dims)
          ref.current = el
        }}
      />
    )
  }
  render(<Box />)
  return screen.getByTestId('box')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('the scroll shadows fallback', () => {
  it('marks neither edge when everything fits', async () => {
    const box = await renderBox({ client: 500, content: 500, top: 0 })
    expect(box.hasAttribute('data-more-above')).toBe(false)
    expect(box.hasAttribute('data-more-below')).toBe(false)
  })

  it('marks only the bottom edge at the top of a long body', async () => {
    const box = await renderBox({ client: 500, content: 800, top: 0 })
    expect(box.hasAttribute('data-more-above')).toBe(false)
    expect(box.hasAttribute('data-more-below')).toBe(true)
  })

  it('marks both edges mid-way and only the top one at the end', async () => {
    const box = await renderBox({ client: 500, content: 800, top: 0 })
    box.scrollTop = 150
    fireEvent.scroll(box)
    expect(box.hasAttribute('data-more-above')).toBe(true)
    expect(box.hasAttribute('data-more-below')).toBe(true)
    box.scrollTop = 300
    fireEvent.scroll(box)
    expect(box.hasAttribute('data-more-above')).toBe(true)
    expect(box.hasAttribute('data-more-below')).toBe(false)
  })

  // Where the browser has scroll-driven animations, index.css draws the
  // shadows alone and the hook leaves the element untouched.
  it('does nothing where the stylesheet can tell for itself', async () => {
    const box = await renderBox({ client: 500, content: 800, top: 0 }, true)
    expect(box.hasAttribute('data-more-below')).toBe(false)
  })
})
