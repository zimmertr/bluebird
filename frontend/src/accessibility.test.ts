import { describe, expect, it } from 'vitest'
// `?raw` gives us each file's text without executing it, which is how a
// component is linted under a Vitest that has no DOM (the trick styles.test.ts
// and metrics.test.ts use).
import modelCompareSource from './components/ModelCompare.tsx?raw'
import appSource from './App.tsx?raw'
import modelPickerSource from './components/ModelPicker.tsx?raw'
import resultsTableSource from './components/ResultsTable.tsx?raw'

// The opening tag of every anchor in a file, whichever attributes it carries.
function openingTags(source: string, tag: string): string[] {
  return source.match(new RegExp(`<${tag}\\s[^>]*>`, 'g')) ?? []
}

describe('a link that leaves the app', () => {
  // WCAG 2.4.4: the purpose of a link has to be clear from the link itself.
  // Two of the table's links fail that on their text alone — one is an icon
  // and one IS the measurement, which announced as "link, 0.0000" — so the
  // label is the whole answer, and it also has to warn about the new tab,
  // which nothing else on the row can say.
  it('every new-tab anchor in the results table says where it goes', () => {
    const offenders = openingTags(resultsTableSource, 'a')
      .filter((tag) => tag.includes('target="_blank"'))
      .filter((tag) => !/aria-label=.*Opens in a new tab\./s.test(tag))
    expect(offenders, 'add an aria-label ending "Opens in a new tab."').toEqual([])
  })

  it('reads the anchors it claims to lint', () => {
    const blank = openingTags(resultsTableSource, 'a').filter((t) =>
      t.includes('target="_blank"'),
    )
    expect(blank.length).toBeGreaterThanOrEqual(3)
  })
})

describe('a listbox option id', () => {
  // `optionDomId` in utils/listbox.ts builds these from the option's own id,
  // and listbox.test.ts pins that. This is the other half: the component must
  // not go back to interpolating the loop counter or the active index, which
  // is what `aria-activedescendant` used to point at.
  it('is never built from a position in the list', () => {
    const positional = /(?:\bid|aria-activedescendant)=\{`[^`]*\$\{\s*(?:i|active)\s*\}/g
    expect(modelPickerSource.match(positional)).toBeNull()
  })

  it('reads the file it claims to lint', () => {
    expect(modelPickerSource).toContain('aria-activedescendant')
  })
})

describe('the model picker’s two parts', () => {
  // The list SELECTS the models the chart draws (#232), so more than one row is
  // `aria-selected` at a time. Without this the second and later ticks are a
  // state a screen reader is told nothing about, since the visible boxes are
  // drawn rather than announced.
  it('says the list is multi-selectable', () => {
    expect(modelPickerSource).toContain('aria-multiselectable')
  })

  // The boxes carry no semantics of their own for exactly that reason: a
  // focusable input inside a `role="option"` would be a second tab stop in a
  // list whose whole keyboard model is one element plus
  // `aria-activedescendant`.
  it('keeps the drawn checkboxes out of the accessibility tree', () => {
    const boxes = modelPickerSource.match(/<input\s[^>]*type="checkbox"[^>]*>/gs) ?? []
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box).toContain('aria-hidden="true"')
      expect(box).toContain('tabIndex={-1}')
    }
  })

  // The chip row RANKS, and it is a toolbar rather than a second listbox: its
  // chips are buttons that act, not options that are chosen, so the arrow keys
  // that walk a selection stay with the one list below.
  it('gives the chip row the toolbar role', () => {
    expect(modelPickerSource).toContain('role="toolbar"')
  })

  // The one accessible name built rather than written. A bare × announces as
  // "button" and nothing else, and a row of them announces as the same button
  // repeated, which is the state a chip row is most likely to be read in.
  it('names each chip’s remove button after its model', () => {
    expect(modelPickerSource).toContain('aria-label={`Remove ${label}`}')
  })

  // The slot is drawn on every chip and hidden with `invisible` rather than
  // dropped, so moving the highlight cannot resize a chip and shuffle the row
  // under the pointer that moved it. A conditional render here is the bug.
  it('keeps the remove slot on the chip that ranks', () => {
    const at = modelPickerSource.indexOf('CHIP.remove')
    expect(at).toBeGreaterThan(0)
    const open = modelPickerSource.lastIndexOf('<button', at)
    expect(modelPickerSource.slice(open - 120, open)).not.toContain('&&')
    expect(modelPickerSource).toContain('invisible')
  })

  // Two parts, two gestures, and no third one. An action below the list would
  // be a control that is neither a row nor a chip, in a popover whose whole
  // design is that the list selects and the chips rank.
  it('carries no action below the list', () => {
    expect(modelPickerSource).not.toContain('Clear comparison')
  })
})

describe('the chart’s comparison key', () => {
  // The #232 review moved every comparison control into the panel's model
  // picker: the chart is a read-only key, so nothing on it spends or changes
  // state. A control here would be a second place to do the same thing, and the
  // one a reader meets while looking at results rather than choosing inputs.
  it('carries no control of any kind', () => {
    expect(modelCompareSource).not.toContain('<select')
    expect(modelCompareSource).not.toContain('<button')
  })
})

// A disabled control says that it cannot be used and never why, so two of them
// carry their reason (#123): the model picker over an archive window, and the
// Layers popover's Forecast grid row over a report holding archive hours.
//
// A `title` alone would not reach the readers who need it most. It is a
// pointer's affordance: no touch device shows one, and a screen reader is not
// promised it either — which is the same argument the tooltip rule itself rests
// on. So the sentence is mounted twice, and this is what keeps the second copy
// from being dropped by an edit to the first. What it proves is that neither
// file has an `aria-describedby` without hidden text to point at; that the two
// carry the SAME sentence is kept true by naming it once at the call site.
describe('a disabled control that says why', () => {
  const withTooltips: Record<string, string> = {
    './App.tsx': appSource,
    './components/ModelPicker.tsx': modelPickerSource,
  }

  it.each(Object.entries(withTooltips))('%s gives its reason a hidden twin', (_path, source) => {
    const described = (source.match(/aria-describedby=/g) ?? []).length
    const hidden = (source.match(/className=\{SR_ONLY\}/g) ?? []).length
    expect(described).toBeGreaterThan(0)
    expect(hidden).toBe(described)
  })
})
