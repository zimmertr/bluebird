import { describe, expect, it } from 'vitest'
// `?raw` gives us the file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. (The same trick does not
// work on index.css: vitest stubs CSS imports to an empty string.)
import controlPanelSource from './components/ControlPanel.tsx?raw'

// Tap-target sizing is a pointer question, not a viewport question. The
// controls panel is 320px wide at every breakpoint, so a width variant used
// for padding re-spaced its rows on desktop windows that had not changed
// size, while leaving large tablets with mouse-tight rows. Nothing catches a
// relapse at build time: `lg:py-*` reads as ordinary responsive code.
describe('coarse-pointer tap targets', () => {
  it('sizes controls by pointer type rather than viewport width', () => {
    expect(controlPanelSource).toMatch(/\btouch:/)
    expect(controlPanelSource).not.toMatch(
      /\b(sm|md|lg|xl|2xl):(p[xytrbl]?|space-[xy]|gap|min-h|h)-/,
    )
  })
})
