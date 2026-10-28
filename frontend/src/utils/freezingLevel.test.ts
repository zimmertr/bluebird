import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FREEZE_MODELS,
  FREEZE_MODEL_IDS,
  FREEZE_UNAVAILABLE_NOTE,
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

describe('FREEZE_UNAVAILABLE_NOTE', () => {
  it('names the metric from the vocabulary rather than spelling it', () => {
    expect(FREEZE_UNAVAILABLE_NOTE.startsWith(NOUN.freeze)).toBe(true)
  })

  // The app's standing copy rules: one line, sentence case, a full stop, and
  // no em dash. The approved text also names the three models that serve the
  // variable, in the picker's own words (#803, W9), because the model is a
  // control the reader can act on.
  it('is one sentence-case line naming the models that serve it', () => {
    expect(FREEZE_UNAVAILABLE_NOTE).toBe(
      'Freezing level is only available from the NOAA GFS, NOAA HRRR and DWD ICON models.',
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

  // The set the panel acts on and the sentence a reader sees are one table,
  // so a model added to one is in the other.
  it('agrees with the note that names them', () => {
    for (const id of FREEZE_MODEL_IDS) expect(FREEZE_UNAVAILABLE_NOTE).toContain(FREEZE_MODELS[id])
  })

  // The note names the models in the picker's words, and the picker's words
  // are the backend's `MODEL_INFO` labels, published by /api/capabilities.
  // Read from the source, as `legal.test.ts` reads the server's: the Vitest
  // container mounts the repository root (docs/DEVELOPMENT.md).
  it('names each model by the label the picker shows', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, '..', '..', '..', 'backend', 'app', 'forecast_models.py'), 'utf-8')
    for (const [id, label] of Object.entries(FREEZE_MODELS)) {
      expect(source, `${id} is not labelled ${label}`).toMatch(
        new RegExp(`ForecastModel\\.${id}: ModelInfo\\(\\s*"${label}"`),
      )
    }
  })
})
