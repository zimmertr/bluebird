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

// ── What keeps the memoized children memoized (#337, finding 8) ────────────
//
// `ResultsTable`, `TimeSeriesChart` and `MapView` are wrapped in `React.memo`,
// which is worth exactly nothing if App.tsx hands them a fresh value on every
// render. Measured 2026-09-14 on a 946-destination analysis: toggling a map
// overlay, which cannot change a row or a ranking, cost 311 to 392 ms of
// synchronous React work before this.
describe('the props the memoized children get', () => {
  const memoized = ['ResultsTable', 'TimeSeriesChart', 'MapView']

  function propsOf(name: string): string[] {
    // The tag, not a type argument: `useRef<MapViewHandle>` starts with
    // `<MapView` too, and matching it read the wrong region of the file.
    const open = appSource.search(new RegExp(`<${name}\\s`))
    if (open < 0) return []
    const close = appSource.indexOf('\n', appSource.indexOf('/>', open))
    return appSource
      .slice(open, close)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[a-zA-Z]+=\{/.test(line))
  }

  it.each(memoized)('%s is actually memoized', (name) => {
    const source = import.meta.glob('./components/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    expect(source[`./components/${name}.tsx`]).toContain(`export default memo(${name})`)
  })

  it.each(memoized)('%s gets no inline function or literal', (name) => {
    const props = propsOf(name)
    // A regex that stopped matching would otherwise make this test pass by
    // finding nothing at all.
    expect(props.length, `found no props on <${name}>`).toBeGreaterThan(5)
    const offenders = props.filter(
      (line) => line.includes('=>') || /=\{\[\]\}|\?\? \[\]|\?\? \{\}/.test(line),
    )
    expect(offenders, `wrap these in useCallback or hoist them: ${offenders.join(' | ')}`).toEqual(
      [],
    )
  })
})

// The chart's selected rows are looked up through an index, not scanned for.
// `selectedKeys.map(k => results.find(...))` is a scan of every row for every
// row: 895,000 key builds for a 946-destination report, measured at 44 ms, and
// it runs on every keystroke in the coordinates box because the `results` the
// hook is given is rebuilt with the pending list (#337).
describe('the chart selection lookup', () => {
  it('indexes the rows instead of scanning them', () => {
    expect(chartSelectionSource).not.toMatch(/results\.find\(/)
    expect(chartSelectionSource).toContain('byKey.get(k)')
  })
})

// ── The one new string the arriving field needs (#337, finding 2) ──────────
describe('the results bar while the field is arriving', () => {
  it('marks the count "so far" and adds nothing else', () => {
    // Approved by the maintainer on 2026-09-14 as two words on the count that
    // already exists: "Lowest Precipitation · Total (48 of 312 so far)". No
    // second line, no box, no tooltip. The count is what is provisional, so
    // the count is what carries it.
    expect(appSource).toContain("const tail = arriving ? ' so far' : ''")
  })

  it('opens the results area before awaiting the analysis', () => {
    // Measured 2026-09-14 on a 946-destination analysis: the first ranked rows
    // are on screen at 0.4 s and grow with each paced batch, where the whole
    // run takes 43.6 s. Opening the area after the await would hide every one
    // of them until the end, which is what this change exists to fix.
    const openAt = appSource.indexOf('if (willRank) setShowResults(true)')
    const firstAwait = appSource.indexOf('await analyze({')
    expect(openAt).toBeGreaterThan(-1)
    expect(openAt).toBeLessThan(firstAwait)
  })

  it('takes the flag from the hook rather than from `loading`', () => {
    // `loading` is true from the click; `arriving` only once rows exist, which
    // is the difference between "we are working" and "these rows are a floor".
    expect(appSource).toMatch(/\n\s+arriving,\n/)
  })
})

// ── The panel resize grips (#382) ──────────────────────────────────────────
//
// The bar between two panels answers two gestures: drag to resize, double
// press to put that panel back. App.tsx spelled both twice, markup included,
// so the two could drift into looking or behaving differently. A component
// needs a DOM this node-env suite has not got, so what is asserted here is
// that one spelling is left.
describe('the resize grips', () => {
  it('draws both through the one component', () => {
    expect(appSource.match(/<ResizeGrip\b/g)).toHaveLength(2)
  })

  it('keeps no grip markup or press clock of its own', () => {
    // `TAP.grip` is the role only this bar wears, and the double-press window
    // is the gesture the browser's own dblclick never reaches.
    expect(appSource).not.toMatch(/TAP\.grip/)
    expect(appSource).not.toMatch(/DOUBLE_PRESS_MS/)
  })

  // The geometry stays the caller's: the chart grip trades against the map,
  // the table grip against the chart in Both mode and the map alone otherwise.
  // Moving it into the component would make one grip need to know which one it
  // is, which is what the two handlers already say.
  it('leaves the geometry at the call site', () => {
    expect(appSource).toContain('splitChartTable(chartPanelPx, tablePanelPx, up)')
  })
})
