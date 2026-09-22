import { describe, expect, it } from 'vitest'
import { SNOW_DEPTH_CEILING_IN, isSnowDepthKey, snowCellText } from './snowCeiling'
import table from '../components/ResultsTable.tsx?raw'
import popup from './popupRows.ts?raw'
import csv from './resultsCsv.ts?raw'
import { FAMILY_KEYS } from '../metrics'
import { COLUMNS } from './tableColumns'

describe('isSnowDepthKey', () => {
  // Read off the family's own key list, so the column and this module cannot
  // disagree about which cells the mark belongs on.
  it('answers for the snow column and nothing else', () => {
    for (const key of FAMILY_KEYS.snow) expect(isSnowDepthKey(key)).toBe(true)
    const snow = new Set<string>([...FAMILY_KEYS.snow])
    for (const col of COLUMNS) {
      if (snow.has(col.key as string)) continue
      expect(isSnowDepthKey(col.key as string)).toBe(false)
    }
  })
})

describe('snowCellText', () => {
  // The file carries depth as int16 millimetres, so 32,767 mm is all it can
  // hold. The value is the ceiling, not a reading, and the mark says so.
  it('marks a depth the source file could not hold', () => {
    expect(snowCellText(SNOW_DEPTH_CEILING_IN)).toBe('≥1,290')
  })

  // One hundredth of an inch below the ceiling is a depth the file held, so it
  // is printed as the measurement it is.
  it('leaves a depth below the ceiling to the column', () => {
    expect(snowCellText(1290.03)).toBeNull()
    expect(snowCellText(0)).toBeNull()
    expect(snowCellText(262 / 1000 * 39.3701)).toBeNull()
  })

  // Nothing can read above the ceiling today, but a file that changed would
  // be marked rather than printed plainly.
  it('marks anything at or above the ceiling', () => {
    expect(snowCellText(SNOW_DEPTH_CEILING_IN + 1)).toBe('≥1,290')
  })

  it('answers nothing for an absent value', () => {
    expect(snowCellText(null)).toBeNull()
    expect(snowCellText(undefined)).toBeNull()
  })

  // The file's other numbers carry no thousands separator, so neither does
  // this one: a spreadsheet reads `1,290` as text.
  it('drops the grouping for the downloaded file', () => {
    expect(snowCellText(SNOW_DEPTH_CEILING_IN, false)).toBe('≥1290')
  })

  // The mark is a statement about the SOURCE file, so it is only honest while
  // the pod and the browser agree on where that file stops counting.
  it('is the ceiling the backend derives', () => {
    expect(SNOW_DEPTH_CEILING_IN).toBe(1290.04)
  })
})

describe('the three surfaces that draw the mark', () => {
  // `ResultsTable.tsx` cannot be tested any other way: Vitest runs node-env
  // and the table needs a DOM. So the rule is read off the source instead,
  // which also covers the two surfaces that could have spelled it again.
  it('each read the one module rather than spelling the mark', () => {
    for (const [name, source] of [
      ['ResultsTable.tsx', table],
      ['popupRows.ts', popup],
      ['resultsCsv.ts', csv],
    ] as const) {
      expect(source, `${name} does not read snowCellText`).toContain('snowCellText')
      expect(source, `${name} spells the mark itself`).not.toContain('\u2265')
      expect(source, `${name} spells the ceiling itself`).not.toMatch(/1,?290/)
    }
  })
})
