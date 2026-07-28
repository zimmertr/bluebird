import { describe, expect, it } from 'vitest'
// `?raw` gives us the file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. (The same trick does not
// work on index.css: vitest stubs CSS imports to an empty string.)
import controlPanelSource from './components/ControlPanel.tsx?raw'

// The controls panel is 320px wide at every breakpoint, so a width variant
// used for padding re-spaced its rows on desktop windows that had not changed
// size, while leaving large tablets with mouse-tight rows. Nothing catches a
// relapse at build time: `lg:py-*` reads as ordinary responsive code.
describe('control panel sizing', () => {
  it('sizes controls by pointer type rather than viewport width', () => {
    expect(controlPanelSource).toMatch(/\btouch:/)
    expect(controlPanelSource).not.toMatch(
      /\b(sm|md|lg|xl|2xl):(p[xytrbl]?|space-[xy]|gap|min-h|h)-/,
    )
  })

  // One radio size and one choice-label treatment across the panel. The rank
  // rows were h-4/text-sm against h-3.5/text-xs everywhere else, and the three
  // forecast-mode labels were semibold/slate-300 against regular/slate-200.
  // Same family and size throughout, so the odd ones out read as a different
  // typeface rather than as emphasis. Static field labels (Find:, Start, End)
  // are slate-400 and deliberately excluded.
  it('gives every control the same radio and label treatment', () => {
    const sizes = controlPanelSource.match(/accent-sky-500 h-[\d.]+ w-[\d.]+/g) ?? []

    expect(sizes.length).toBeGreaterThan(1)
    expect([...new Set(sizes)]).toHaveLength(1)
    expect(controlPanelSource).not.toMatch(/<span className="text-sm/)
    expect(controlPanelSource).not.toMatch(/<span className="[^"]*\bfont-semibold/)
  })
})
