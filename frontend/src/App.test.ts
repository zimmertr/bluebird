import { describe, expect, it } from 'vitest'
// `?raw` gives the file's text without executing it, the drift-guard idiom
// metrics.test.ts and useCapabilities.test.ts already use. A component and a
// hook both need a DOM the node-env Vitest has not got, so the rules below are
// asserted against the source the way styles.test.ts asserts its own. What the
// effects decide is tested for real, as pure functions, beside the util.
import appSource from './App.tsx?raw'
import chartSelectionSource from './hooks/useChartSelection.ts?raw'

// The dependency list of every useEffect in the given source, as written.
// Scoped to useEffect on purpose: a useMemo over the same value is a derivation
// and costs one recomputation, where an effect is a commit.
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

describe('the effects useChartSelection.ts runs', () => {
  const deps = effectDependencies(chartSelectionSource)

  it('finds every effect in the file', () => {
    expect(deps).toHaveLength(2)
  })

  // `results` is App.tsx's `chartCandidates`: the displayed rows plus the
  // pending ones, rebuilt whenever either list is re-derived. That is once per
  // keystroke in the coordinates box and once per live knob change, for a set of
  // destinations that has usually not changed at all. Key the debut scan on the
  // SET's identity, which is a value React can compare.
  it('keys no effect on the array of chart candidates', () => {
    for (const list of deps) {
      expect(list, 'an effect keyed on the rows runs once per render').not.toContain('results')
    }
  })

  it('debuts on the identity of the candidate set', () => {
    expect(chartSelectionSource).toContain(
      'const candidatesKey = useMemo(() => candidateSetKey(results), [results])',
    )
    expect(deps).toContainEqual(['candidatesKey'])
  })
})
