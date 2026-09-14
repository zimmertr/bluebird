import { describe, expect, it } from 'vitest'
import {
  pruneHidden,
  shownModels,
  toggleHidden,
  visibilityRows,
  type VisibilityModel,
} from './modelVisibility'

// The chart's own list: the ranking model first, carrying no colour because
// its lines wear their destinations', then every compared model with one.
const ON_CHART: VisibilityModel[] = [
  { id: 'gfs_seamless', label: 'NOAA GFS', color: null },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS', color: '#fbbf24' },
  { id: 'gfs_hrrr', label: 'NOAA HRRR', color: '#c084fc' },
]

describe('the rows the popover lists', () => {
  it('keeps the order the chart draws in, ranking model first', () => {
    const rows = visibilityRows(ON_CHART, new Set())
    expect(rows.map((r) => r.id)).toEqual(['gfs_seamless', 'ecmwf_ifs025', 'gfs_hrrr'])
  })

  it('says which rows are showing', () => {
    const rows = visibilityRows(ON_CHART, new Set(['ecmwf_ifs025']))
    expect(rows.map((r) => r.visible)).toEqual([true, false, true])
  })

  // The swatch is the line's colour, and the ranking model has none: its lines
  // are not one colour, each wears its own destination's.
  it('carries each model’s line colour, and none for the ranking model', () => {
    const rows = visibilityRows(ON_CHART, new Set())
    expect(rows[0].color).toBeNull()
    expect(rows[1].color).toBe('#fbbf24')
  })
})

describe('which lines survive', () => {
  it('drops a hidden model and nothing else', () => {
    const shown = shownModels(ON_CHART, new Set(['gfs_hrrr']))
    expect(shown.map((m) => m.id)).toEqual(['gfs_seamless', 'ecmwf_ifs025'])
  })

  // The ranking model is not special here. Its lines are the report's, but the
  // reader asked to read two compared models against each other.
  it('hides the ranking model when the reader hides it', () => {
    expect(shownModels(ON_CHART, new Set(['gfs_seamless'])).map((m) => m.id)).toEqual([
      'ecmwf_ifs025',
      'gfs_hrrr',
    ])
  })

  // No floor. An empty chart is the honest answer to "hide everything", where
  // a last-one-standing rule is a rule the reader finds by pressing something
  // that does not respond.
  it('allows every model to be hidden at once', () => {
    expect(shownModels(ON_CHART, new Set(ON_CHART.map((m) => m.id)))).toEqual([])
  })

  it('draws everything when nothing is hidden', () => {
    expect(shownModels(ON_CHART, new Set())).toHaveLength(3)
  })
})

describe('putting a model down and picking it up', () => {
  it('hides one that was showing', () => {
    expect([...toggleHidden(new Set(), 'gfs_hrrr')]).toEqual(['gfs_hrrr'])
  })

  it('shows one that was hidden', () => {
    expect([...toggleHidden(new Set(['gfs_hrrr']), 'gfs_hrrr')]).toEqual([])
  })

  it('leaves the set it was given alone', () => {
    const before = new Set(['gfs_hrrr'])
    toggleHidden(before, 'ecmwf_ifs025')
    expect([...before]).toEqual(['gfs_hrrr'])
  })
})

describe('a flag outliving its model', () => {
  // A model unselected in the picker and selected again comes back DRAWN,
  // rather than invisible because of a decision about a chart that is gone.
  it('drops the flag of a model nobody has selected', () => {
    expect(pruneHidden(new Set(['gfs_hrrr']), ['gfs_seamless', 'ecmwf_ifs025'])).toEqual(
      new Set(),
    )
  })

  it('keeps the flag of a model still selected', () => {
    expect(pruneHidden(new Set(['gfs_hrrr']), ['gfs_seamless', 'gfs_hrrr'])).toBeNull()
  })

  // Null is what lets the caller skip the write rather than setting state on
  // every render the selection did not move.
  it('says so when there is nothing to drop', () => {
    expect(pruneHidden(new Set(), ['gfs_seamless'])).toBeNull()
    expect(pruneHidden(new Set(['a', 'b']), ['a', 'b', 'c'])).toBeNull()
  })

  it('drops several at once', () => {
    expect(pruneHidden(new Set(['a', 'b', 'c']), ['b'])).toEqual(new Set(['b']))
  })
})
