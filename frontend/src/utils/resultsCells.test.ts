import { describe, expect, it } from 'vitest'
import {
  cellColor,
  cellText,
  fireCell,
  modelCellText,
  pendingChartRow,
  pendingLinkRow,
  rankText,
  rowKeys,
  unavailableCell,
  windyCellUrl,
} from './resultsCells'
import { FIRE_UNAVAILABLE_NOTE, FIRE_UNCOVERED_NOTE, fireWarningText } from './fireProximity'
import { FREEZE_UNAVAILABLE_NOTE } from './freezingLevel'
import { SNOW_DEPTH_CEILING_IN, snowCellText } from './snowCeiling'
import { cellStyle, scaleFor } from './colors'
import { displayedColumns, type ColDef } from './tableColumns'
import { windyUrl } from './windy'
import type { ModelRow } from './modelCompare'
import { fireWarning, pendingDestination, resultRow } from '../testSupport/fixtures'

const WARNING = fireWarning()
const column = (key: string): ColDef => {
  const found = displayedColumns(false, 'precip_total_in').find((c) => c.key === key)
  if (!found) throw new Error(`no column ${key}`)
  return found
}
const compared = (over: Partial<ModelRow>): ModelRow =>
  ({ ...resultRow(), modelId: 'icon_seamless', modelLabel: 'DWD ICON', rank: 4, ...over }) as ModelRow

describe('fireCell', () => {
  it('marks every row N/A with the failure note when the check failed', () => {
    expect(fireCell('unavailable', WARNING, false)).toEqual({ text: 'N/A', note: FIRE_UNAVAILABLE_NOTE })
  })

  it('names the fire on a warned row once the check answered', () => {
    const cell = fireCell('ready', WARNING, false)
    expect(cell.note).toBe(fireWarningText(WARNING))
    expect(cell.text).toContain('3.2')
  })

  it('says why an uncovered row reads N/A', () => {
    expect(fireCell('ready', undefined, true)).toEqual({ text: 'N/A', note: FIRE_UNCOVERED_NOTE })
  })

  it('carries no note on a cleared row or while the check runs', () => {
    expect(fireCell('ready', undefined, false)).toEqual({ text: '—', note: null })
    expect(fireCell('loading', WARNING, false).note).toBeNull()
  })
})

describe('modelCellText', () => {
  it('reads the compared row its own model, then the analysis model, then a dash', () => {
    expect(modelCellText(compared({}), 'NOAA GFS')).toBe('DWD ICON')
    expect(modelCellText(resultRow(), 'NOAA GFS')).toBe('NOAA GFS')
    expect(modelCellText(resultRow(), null)).toBe('—')
  })
})

describe('unavailableCell', () => {
  it('reads an empty freezing level N/A and says the model is why', () => {
    expect(unavailableCell('freeze_min_ft', null)).toEqual({ text: 'N/A', cause: FREEZE_UNAVAILABLE_NOTE })
  })

  it('reads an empty snow depth N/A with no hover text', () => {
    expect(unavailableCell('snow_depth_in', null)).toEqual({ text: 'N/A', cause: undefined })
  })

  it('lets a number and every other column through', () => {
    expect(unavailableCell('freeze_min_ft', 8000)).toBeNull()
    expect(unavailableCell('aqi_max', null)).toBeNull()
  })
})

describe('cellText', () => {
  it('prints a clipped snow depth as the shared ceiling mark', () => {
    expect(cellText(column('snow_depth_in'), SNOW_DEPTH_CEILING_IN)).toBe(snowCellText(SNOW_DEPTH_CEILING_IN))
  })

  it('formats through the column, and prints a dash for a missing value', () => {
    const col = column('temp_min_f')
    expect(cellText(col, 21.26)).toBe(col.format!(21.26))
    expect(cellText({ key: 'name', label: 'Name' } as ColDef, null)).toBe('—')
    expect(cellText({ key: 'name', label: 'Name' } as ColDef, 'Mount Adams')).toBe('Mount Adams')
  })
})

describe('cellColor', () => {
  const group = new Set(['precip_total_in', 'precip_max_in_hr'])

  it('scores a ranked cell on its own column scale', () => {
    expect(cellColor('precip_max_in_hr', 0.2, group, false)).toEqual(
      cellStyle(0.2, scaleFor('precip_max_in_hr', false)!),
    )
  })

  it('leaves unranked and empty cells to the table base', () => {
    expect(cellColor('temp_min_f', 20, group, false)).toBeUndefined()
    expect(cellColor('precip_total_in', null, group, false)).toBeUndefined()
  })
})

describe('windyCellUrl', () => {
  const KEY = 'precip_total_in'

  it('opens the analysis model when the row names none', () => {
    const row = resultRow({ latitude: 46.85, longitude: -121.76 })
    expect(windyCellUrl(row, KEY, 'rain', 'gfs_seamless', [])).toBe(
      windyUrl({ latitude: 46.85, longitude: -121.76, layer: 'rain', modelId: 'gfs_seamless', atMs: null }),
    )
  })

  it('opens a compared row on its own model', () => {
    const row = compared({ latitude: 46.85, longitude: -121.76 })
    expect(windyCellUrl(row, KEY, 'rain', 'gfs_seamless', [])).toBe(
      windyUrl({ latitude: 46.85, longitude: -121.76, layer: 'rain', modelId: 'icon_seamless', atMs: null }),
    )
  })
})

describe('rankText', () => {
  it('numbers by position, unless a comparison carries the destination rank', () => {
    expect(rankText(resultRow(), 0)).toBe('1')
    expect(rankText(compared({ rank: 4 }), 0)).toBe('4')
  })
})

describe('rowKeys', () => {
  const a = resultRow({ name: 'A', latitude: 46.1, longitude: -121.1 })
  const b = resultRow({ name: 'B', latitude: 46.2, longitude: -121.2 })

  it('gives a destination the same key wherever a sort puts it', () => {
    const [ka, kb] = rowKeys([a, b])
    expect(rowKeys([b, a])).toEqual([kb, ka])
  })

  it('tells one destination under two models apart', () => {
    const keys = rowKeys([compared({ ...a, modelId: 'gfs_seamless' }), compared({ ...a, modelId: 'icon_seamless' })])
    expect(new Set(keys).size).toBe(2)
  })

  it('never repeats a key, even for two rows at one coordinate', () => {
    const keys = rowKeys([a, { ...a, name: 'A twin' }, b])
    expect(new Set(keys).size).toBe(3)
  })
})

describe('pending rows', () => {
  const pending = pendingDestination({ kind: 'peak', osmId: 'node/9' })

  it('keys the chart on the coordinate', () => {
    expect(pendingChartRow(pending)).toEqual({ name: 'Probe Peak', latitude: 47.1, longitude: -121.2 })
  })

  it('links a searched summit as a peak and anything else as custom', () => {
    expect(pendingLinkRow(pending)).toMatchObject({ type: 'peak', osm_id: 'node/9' })
    expect(pendingLinkRow({ ...pending, kind: undefined, osmId: undefined })).toMatchObject({
      type: 'custom',
      osm_id: null,
    })
  })
})
