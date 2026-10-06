import { describe, expect, it } from 'vitest'
import tourSource from './Tour.tsx?raw'

// The overlay moves one box, the panel's own scroller, and nothing else.
// `scrollIntoView` and a bare `focus()` both scroll every ancestor that can,
// and the app's root can whenever a positioned descendant stretches its
// overflow: over a 101-row report each step pushed the whole page further up
// and the end of the tour left it there (2026-10-06). The node suite reads
// the source, since the overlay itself needs a page to render.
describe('Tour', () => {
  it('never scrolls every ancestor into view', () => {
    // The call, not the word: the source names it to say why it is absent.
    expect(tourSource).not.toContain('.scrollIntoView(')
  })

  it('focuses without scrolling', () => {
    const focusCalls = tourSource.match(/\.focus\([^)]*\)/g) ?? []
    expect(focusCalls.length).toBeGreaterThan(0)
    for (const call of focusCalls) expect(call).toBe('.focus({ preventScroll: true })')
  })
})
