import { describe, expect, it } from 'vitest'
import { FREEZE_UNAVAILABLE_NOTE, freezeCellText, isFreezeKey } from './freezingLevel'
import { COLUMNS } from './tableColumns'
import { FAMILY_KEYS, NOUN } from '../metrics'

describe('isFreezeKey', () => {
  it('answers for every freezing-level column and nothing else', () => {
    for (const key of FAMILY_KEYS.freeze) expect(isFreezeKey(key)).toBe(true)
    for (const col of COLUMNS) {
      if (FAMILY_KEYS.freeze.includes(col.key as never)) continue
      expect(isFreezeKey(col.key as string), `${String(col.key)} reads as freezing level`).toBe(
        false,
      )
    }
    // The virtual wildfire key and the identity columns reach here too.
    expect(isFreezeKey('wildfire_mi')).toBe(false)
    expect(isFreezeKey('name')).toBe(false)
  })
})

describe('freezeCellText', () => {
  // The classification is made from the DATA, never from a list of models: a
  // model that starts publishing the variable then works with no code change.
  it('marks an empty cell N/A and leaves a number to the column', () => {
    expect(freezeCellText(null)).toBe('N/A')
    expect(freezeCellText(undefined)).toBe('N/A')
    expect(freezeCellText(9000)).toBeNull()
  })

  // Open-Meteo clamps the freezing level to 0 when the whole column is below
  // freezing, which is the coldest answer there is rather than a missing one.
  it('treats zero as a reading, not a gap', () => {
    expect(freezeCellText(0)).toBeNull()
  })
})

describe('FREEZE_UNAVAILABLE_NOTE', () => {
  it('names the metric from the vocabulary rather than spelling it', () => {
    expect(FREEZE_UNAVAILABLE_NOTE.startsWith(NOUN.freeze)).toBe(true)
  })

  // The app's standing copy rules: one line, sentence case, a full stop, and
  // no em dash. The approved text also names the three models that serve the
  // variable, because the model is a control the reader can act on.
  it('is one sentence-case line naming the models that serve it', () => {
    expect(FREEZE_UNAVAILABLE_NOTE).toBe(
      'Freezing level is only available from the GFS Seamless, HRRR and ICON models.',
    )
    expect(FREEZE_UNAVAILABLE_NOTE).not.toContain('\n')
    expect(FREEZE_UNAVAILABLE_NOTE).not.toContain('—')
    expect(FREEZE_UNAVAILABLE_NOTE.length).toBeLessThanOrEqual(80)
  })
})
