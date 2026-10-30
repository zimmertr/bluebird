import { describe, expect, it } from 'vitest'
import { rangeKeys } from './rangeSelect'

// `shiftHeld` reads a browser event, so the pickers' own suites cover it, with
// a click that holds Shift and one that does not.

const ORDER = ['a', 'b', 'c', 'd', 'e']

describe('rangeKeys', () => {
  it('reaches every key from the anchor to the target, both included, either way round', () => {
    expect(rangeKeys(ORDER, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeKeys(ORDER, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeKeys(ORDER, 'a', 'e')).toEqual(ORDER)
  })

  it('is the one key with no anchor, or an anchor the list no longer holds', () => {
    expect(rangeKeys(ORDER, null, 'c')).toEqual(['c'])
    expect(rangeKeys(ORDER, 'gone', 'c')).toEqual(['c'])
    expect(rangeKeys(ORDER, 'c', 'c')).toEqual(['c'])
  })

  it('reaches nothing for a target the list does not hold', () => {
    expect(rangeKeys(ORDER, 'a', 'gone')).toEqual([])
  })
})

// Every group of checkboxes takes a Shift range (the maintainer, 2026-10-22,
// #801: "Shift+Click should ALWAYS work for ranges of checkboxes"). Read as
// text: a component that draws a checkbox takes its range from `useShiftRange`
// or the table's `useChartBox`, or is named here with why it has no group.
const views = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const NO_GROUP: Record<string, string> = {
  '../components/ResultsTableHeader.tsx': 'the one select-all box over the chart column',
}

describe('every checkbox group', () => {
  it('takes a Shift range', () => {
    const missing = Object.entries(views)
      .filter(([path, text]) => !/\.test\.tsx$/.test(path) && /type="checkbox"|CHOICE_INPUT/.test(text))
      .filter(([path, text]) => !(path in NO_GROUP) && !/useShiftRange|useChartBox/.test(text))
      .map(([path]) => path)
    expect(missing, 'wire useShiftRange and shiftHeld, as LayersPopover does').toEqual([])
  })

  it('names no file it does not need to', () => {
    for (const path of Object.keys(NO_GROUP)) expect(views[path], path).toBeDefined()
  })
})
