import { describe, expect, it } from 'vitest'
import { colorForIndex, modelColor } from './chartColors'
import {
  modelRows,
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

const PUBLISHED = [
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'gem_seamless', label: 'ECCC GEM' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
  { id: 'gfs_hrrr', label: 'NOAA HRRR' },
]
// Three destinations already wearing the first three palette entries.
const CHARTED = [colorForIndex(0), colorForIndex(1), colorForIndex(2)]

describe('the models the picker has selected', () => {
  it('leads with the ranking model and follows the selection order', () => {
    const rows = modelRows(PUBLISHED, 'gfs_hrrr', ['ecmwf_ifs025', 'gem_seamless'], CHARTED)
    expect(rows.map((r) => r.id)).toEqual(['gfs_hrrr', 'ecmwf_ifs025', 'gem_seamless'])
  })

  // A row exists the moment a model is ticked, before any Analyze buys it: the
  // popover answers which models the reader wants to look at, and that
  // question does not wait on a fetch.
  it('gives one row per selected model whether or not its lines exist', () => {
    expect(modelRows(PUBLISHED, 'gfs_seamless', [], CHARTED)).toHaveLength(1)
    expect(modelRows(PUBLISHED, 'gfs_seamless', ['gfs_hrrr'], CHARTED)).toHaveLength(2)
  })

  // The ranking model's lines are not one colour: each wears its own
  // destination's, so a square here would name a colour no line is drawn in.
  it('gives the ranking model no colour', () => {
    expect(modelRows(PUBLISHED, 'gfs_seamless', ['gfs_hrrr'], CHARTED)[0].color).toBeNull()
  })

  // The same assignment the chart's lines take, by position in the SELECTION,
  // so a swatch is the colour that model's lines wear once they exist.
  it('colours a compared model by its place in the selection', () => {
    const rows = modelRows(PUBLISHED, 'gfs_seamless', ['ecmwf_ifs025', 'gfs_hrrr'], CHARTED)
    expect(rows[1].color).toBe(modelColor(CHARTED, 0))
    expect(rows[2].color).toBe(modelColor(CHARTED, 1))
  })

  // The rule `modelColor` exists for, checked end to end: no model wears a
  // colour a destination on the same chart is wearing.
  it('never gives a model a charted destination’s colour', () => {
    const rows = modelRows(PUBLISHED, 'gfs_seamless', ['ecmwf_ifs025', 'gfs_hrrr'], CHARTED)
    for (const row of rows) expect(CHARTED).not.toContain(row.color)
  })

  // A compared list that echoes the ranking model would otherwise draw it
  // twice and shift every colour after it.
  it('lists the ranking model once even when the compared set names it', () => {
    const rows = modelRows(PUBLISHED, 'gfs_seamless', ['gfs_seamless', 'gfs_hrrr'], CHARTED)
    expect(rows.map((r) => r.id)).toEqual(['gfs_seamless', 'gfs_hrrr'])
    expect(rows[1].color).toBe(modelColor(CHARTED, 0))
  })

  // Nothing will draw a model this deployment does not publish, and there is
  // no label to name its row with.
  it('skips a model the server does not publish', () => {
    const rows = modelRows(PUBLISHED, 'gfs_seamless', ['nope_x', 'gfs_hrrr'], CHARTED)
    expect(rows.map((r) => r.id)).toEqual(['gfs_seamless', 'gfs_hrrr'])
  })

  it('names each row with the published label', () => {
    const rows = modelRows(PUBLISHED, 'gfs_seamless', ['gfs_hrrr'], CHARTED)
    expect(rows.map((r) => r.label)).toEqual(['NOAA GFS', 'NOAA HRRR'])
  })
})

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
