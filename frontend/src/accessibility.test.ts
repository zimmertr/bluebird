import { describe, expect, it } from 'vitest'
// `?raw` gives us each file's text without executing it, which is how a
// component is linted under a Vitest that has no DOM (the trick styles.test.ts
// and metrics.test.ts use).
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
