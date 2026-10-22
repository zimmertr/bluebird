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
