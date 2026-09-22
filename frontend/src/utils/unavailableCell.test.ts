import { describe, expect, it } from 'vitest'
import { UNAVAILABLE, isUnavailableKey, unavailableCellText } from './unavailableCell'
import { COLUMNS } from './tableColumns'
import { FAMILY_KEYS } from '../metrics'

describe('isUnavailableKey', () => {
  // Two metrics can be empty for a reason that is not the weather, and only
  // two: the model publishes no freezing level, or the destination is outside
  // the snow grid.
  it('answers for those columns and nothing else', () => {
    for (const key of [...FAMILY_KEYS.freeze, ...FAMILY_KEYS.snow]) {
      expect(isUnavailableKey(key)).toBe(true)
    }
    const marked = new Set<string>([...FAMILY_KEYS.freeze, ...FAMILY_KEYS.snow])
    for (const col of COLUMNS) {
      if (marked.has(col.key as string)) continue
      expect(isUnavailableKey(col.key as string), `${String(col.key)} reads as unavailable`).toBe(
        false,
      )
    }
    // The virtual wildfire key and the identity columns reach here too.
    expect(isUnavailableKey('wildfire_mi')).toBe(false)
    expect(isUnavailableKey('name')).toBe(false)
  })

  // Read off the families' own key lists, so an aggregate added to either one
  // cannot be marked in the table and missed here.
  it('is derived from the family key lists rather than a second list', () => {
    const fromFamilies = [...FAMILY_KEYS.freeze, ...FAMILY_KEYS.snow]
    expect(COLUMNS.filter((c) => isUnavailableKey(c.key as string)).map((c) => c.key).sort()).toEqual(
      [...fromFamilies].sort(),
    )
  })
})

describe('unavailableCellText', () => {
  // The classification is made from the DATA, never from a list of models or a
  // coverage polygon: a model that starts publishing the variable, or a grid
  // that grows, then works with no code change.
  it('marks an empty cell and leaves a number to the column', () => {
    expect(unavailableCellText(null)).toBe(UNAVAILABLE)
    expect(unavailableCellText(undefined)).toBe(UNAVAILABLE)
    expect(unavailableCellText(9000)).toBeNull()
  })

  // Bare ground is a measurement, and so is a freezing level at sea level.
  // Neither is a missing answer.
  it('treats zero as a reading, not a gap', () => {
    expect(unavailableCellText(0)).toBeNull()
  })

  // Spelled once, because a file read in a spreadsheet has nothing beside it
  // saying what a blank was supposed to mean.
  it('is the same mark the file carries', () => {
    for (const col of COLUMNS.filter((c) => isUnavailableKey(c.key as string))) {
      expect(col.csvNull).toBe(UNAVAILABLE)
    }
  })
})
