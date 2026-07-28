import { describe, expect, it } from 'vitest'
import { BUTTON_PRIMARY, FIELD, TEXT } from './styles'
// `?raw` gives us the file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. (The same trick does not
// work on index.css: vitest stubs CSS imports to an empty string.)
import controlPanelSource from './components/ControlPanel.tsx?raw'

const SIZE = /\btext-(xs|sm|base|lg|xl|\[[^\]]+\])\b/g

describe('control panel type ramp', () => {
  it('gives each role exactly one size, and no two roles the same recipe', () => {
    for (const [role, classes] of Object.entries(TEXT)) {
      expect(classes.match(SIZE), `${role} must set exactly one size`).toHaveLength(1)
    }
    expect(new Set(Object.values(TEXT)).size).toBe(Object.keys(TEXT).length)
  })

  // The one place the ramp deliberately reuses a size and color. Weight alone
  // separates "Elevation range (ft)" from "Peaks", which keeps a heading
  // readable as a heading without spending a fifth size on it.
  it('separates a sub-heading from control text by weight alone', () => {
    expect(TEXT.subheading.split(' ').filter((c) => c !== 'font-semibold')).toEqual(
      TEXT.control.split(' '),
    )
  })

  it('keeps clarifying prose subdued and italic', () => {
    expect(TEXT.helper).toContain('italic')
    expect(TEXT.helper).toMatch(/text-slate-[5-9]00/)
  })
})

// The panel is 320px wide at every breakpoint, so a width variant used for
// padding re-spaced its rows on desktop windows that had not changed size,
// while leaving large tablets with mouse-tight rows. Nothing catches a relapse
// at build time: `lg:py-*` reads as ordinary responsive code.
describe('control panel sizing', () => {
  // The coarse-pointer padding itself now lives in BUTTON_PRIMARY, asserted
  // below. What has to stay true here is that nothing sizes by window width.
  it('never sizes a control by viewport width', () => {
    expect(controlPanelSource).not.toMatch(
      /\b(sm|md|lg|xl|2xl):(p[xytrbl]?|space-[xy]|gap|min-h|h)-/,
    )
  })

  it('gives every radio and checkbox the same size', () => {
    const sizes = controlPanelSource.match(/accent-sky-500 h-[\d.]+ w-[\d.]+/g) ?? []

    expect(sizes.length).toBeGreaterThan(1)
    expect([...new Set(sizes)]).toHaveLength(1)
  })

  // Spelling type out per element is what let the panel drift into three
  // treatments for one kind of label. Anything above the base size, and any
  // arbitrary size, has to come from the ramp so the drift is visible in one
  // file. Bare `text-xs` stays legal: status lines carry a semantic color.
  it('routes every non-base size through the ramp', () => {
    expect(controlPanelSource).not.toMatch(/className="[^"]*\btext-(sm|base|lg|xl)\b/)
    expect(controlPanelSource).not.toMatch(/className="[^"]*\btext-\[/)
    expect(controlPanelSource).not.toMatch(/<h[123] className="/)
  })
})

// Recipes that appear in more than one component. The primary button had been
// spelled out three times and drifted into two radii, with the coarse-pointer
// padding on only one of them. The glob covers components added later, which is
// the point: a fourth copy should fail here rather than ship a fourth look.
const components = import.meta.glob('./components/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('shared component recipes', () => {
  it('found the component sources', () => {
    expect(Object.keys(components).length).toBeGreaterThan(5)
  })

  it.each(Object.entries(components))('%s restates no shared recipe', (_path, source) => {
    expect(source).not.toMatch(/bg-sky-600 hover:bg-sky-500/)
    expect(source).not.toMatch(/bg-slate-900 border border-slate-600/)
  })

  it('grows the primary action for coarse pointers wherever it appears', () => {
    expect(BUTTON_PRIMARY).toContain('touch:')
    expect(FIELD).toContain(TEXT.control)
  })
})
