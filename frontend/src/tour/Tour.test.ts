import { describe, expect, it } from 'vitest'
import tourSource from './Tour.tsx?raw'
import useTourSource from './useTour.ts?raw'

// The overlay moves one box, the panel's own scroller, and nothing else.
// `scrollIntoView` and a bare `focus()` both scroll every ancestor that can,
// and the app's root can whenever a positioned descendant stretches its
// overflow: over a 101-row report each step pushed the whole page further up
// and the end of the tour left it there (2026-10-06). The node suite reads
// the source, since an ancestor's scroll needs a page that lays out, which
// jsdom is not; `Tour.test.tsx` renders the overlay for the rest.
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

  // The Results and Chart cards wait on two chunks the cold load leaves out,
  // so starting the tour fetches both while the reader reads the first card
  // (#786), the chart's through the loader its lazy pane reads.
  it('warms the chunks its later cards wait on when it starts', () => {
    const start = useTourSource.slice(useTourSource.indexOf('const start = useCallback'), useTourSource.indexOf('const end = useCallback'))
    expect(start).toContain("import('./demoReport')")
    expect(start).toContain('loadTimeSeriesChart()')
  })

  // The hook hands the keyboard back when the tour ends, to a phone's
  // Tutorial link in a Controls sheet still sliding up from below the
  // screen: a bare focus scrolled the app's column 588px and the slide wound
  // it back, the map and the results riding up and down with it (#696).
  it('hands the keyboard back without scrolling', () => {
    const focusCalls = useTourSource.match(/\.focus\([^)]*\)/g) ?? []
    expect(focusCalls.length).toBeGreaterThan(0)
    for (const call of focusCalls) expect(call).toBe('.focus({ preventScroll: true })')
  })
})
