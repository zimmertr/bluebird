import { describe, expect, it } from 'vitest'
import {
  FREEZE_MODEL_IDS,
  FREEZE_UNAVAILABLE_NOTE,
  freezeCellText,
  isFreezeKey,
  modelsWithoutFreeze,
} from './freezingLevel'
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

// The one place the emptiness is decided from a list rather than from the
// data, because the panel has to answer it BEFORE an analysis is bought.
describe('which models can answer a freezing-level ranking', () => {
  const MODELS = [
    { id: 'gfs_seamless', label: 'NOAA GFS' },
    { id: 'gfs_hrrr', label: 'NOAA HRRR' },
    { id: 'icon_seamless', label: 'DWD ICON' },
    { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
    { id: 'meteofrance_seamless', label: 'Meteo-France ARPEGE' },
  ]

  it('names the picked models that carry no freezing level', () => {
    expect(modelsWithoutFreeze(MODELS).map((m) => m.label)).toEqual([
      'ECMWF IFS',
      'Meteo-France ARPEGE',
    ])
  })

  it('returns nothing when every picked model carries it', () => {
    expect(modelsWithoutFreeze(MODELS.slice(0, 3))).toEqual([])
    expect(modelsWithoutFreeze([])).toEqual([])
  })

  // Measured at #295: three of the eight. A model that starts publishing the
  // variable is one id added here, and this is the assertion that says so.
  it('holds the three models measured at #295', () => {
    expect([...FREEZE_MODEL_IDS].sort()).toEqual([
      'gfs_hrrr',
      'gfs_seamless',
      'icon_seamless',
    ])
  })

  // The list and the sentence that names the same three models must not
  // drift: the note is what a reader sees, the set is what the panel acts on.
  it('agrees with the note that names them', () => {
    expect(FREEZE_MODEL_IDS.size).toBe(3)
    for (const word of ['GFS Seamless', 'HRRR', 'ICON']) {
      expect(FREEZE_UNAVAILABLE_NOTE).toContain(word)
    }
  })
})
