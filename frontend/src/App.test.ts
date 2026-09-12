import { describe, expect, it } from 'vitest'
// `?raw` gives the file's text without executing it, the drift-guard idiom
// metrics.test.ts and useCapabilities.test.ts already use. App.tsx is a
// component, and the node-env Vitest has no DOM to render it in, so the rule
// below is asserted against the source the way styles.test.ts asserts its own.
import appSource from './App.tsx?raw'

// The dependency list of every useEffect in App.tsx, as written. Scoped to
// useEffect on purpose: a useMemo over the same value is a derivation and
// costs one recomputation, where an effect is a commit.
function effectDependencies(source: string): string[][] {
  return source
    .split('useEffect(')
    .slice(1)
    .map((rest) => rest.match(/\n {2}\}, \[([^\]]*)\]\)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1].split(',').map((dep) => dep.trim()).filter(Boolean))
}

describe('the effects App.tsx runs', () => {
  const deps = effectDependencies(appSource)

  it('finds every effect in the file', () => {
    expect(deps.length).toBeGreaterThan(10)
  })

  // `csvRows` is `parseCustomCsv(customCsv)`, so it is a fresh array on every
  // keystroke in the coordinates box. An effect keyed on it therefore runs per
  // character, and one that calls a state setter schedules an update per
  // character from inside a passive effect — including the setter calls that
  // change nothing, which React only skips while the fiber has no work
  // pending. Fifty of those in a row is React error #185, which is what typing
  // a coordinate list used to produce (issue #185). Depend on the fact the
  // effect actually reads, not on the array it reads it from.
  it('keys no effect on the per-keystroke CSV rows', () => {
    for (const list of deps) {
      expect(list, 'an effect keyed on csvRows runs once per character').not.toContain('csvRows')
    }
  })

  // The panel still opens the moment a destination is named: the rule above is
  // about how the effect is keyed, not about dropping it.
  it('opens the results panel on the fact that a destination was named', () => {
    expect(appSource).toContain(
      'const destinationNamed = searched.places.length > 0 || csvRows.length > 0',
    )
    expect(deps).toContainEqual(['destinationNamed'])
  })
})
