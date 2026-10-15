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

  // The light's pad and corners come off the target it frames (#696), so the
  // phone's Analyze button sits 8px inside a light rounded 16 + 8.
  it("draws the light's corners from the target's own", () => {
    expect(tourSource).toContain('borderRadius: spotRadius(targetRadius, pad)')
    expect(tourSource).toContain('const pad = spotPad(step.spot, targetRadius)')
    expect(tourSource).toContain('setTargetRadius(radius)')
  })

  // The spotlight lit the Forecast section with the Controls sheet's top
  // shade lying across it (#696): while a tour runs, every shade stands down.
  it('hides every scroll shadow while it runs', () => {
    const TOURING_ATTR = 'data-touring'
    expect(tourSource).toContain(`const TOURING_ATTR = '${TOURING_ATTR}'`)
    expect(tourSource).toContain('document.documentElement.setAttribute(TOURING_ATTR')
    expect(tourSource).toContain('document.documentElement.removeAttribute(TOURING_ATTR)')
    // The rule that reads it is index.css's, held in styles.test.ts.
  })
})
