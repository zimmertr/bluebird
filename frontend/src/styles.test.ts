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

  // Every radio and checkbox in the panel is one size, and every control label
  // is one size. The rank rows used to be h-4/text-sm against h-3.5/text-xs
  // everywhere else, which read as a rhythm bug rather than emphasis, and it
  // only became visible once the rows around it stopped moving.
  it('gives every control the same radio and label size', () => {
    const sizes = controlPanelSource.match(/accent-sky-500 h-[\d.]+ w-[\d.]+/g) ?? []

    expect(sizes.length).toBeGreaterThan(1)
    expect([...new Set(sizes)]).toHaveLength(1)
    expect(controlPanelSource).not.toMatch(/<span className="text-sm/)
  })
})
