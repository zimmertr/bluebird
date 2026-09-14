import { describe, expect, it } from 'vitest'
import {
  canRemove,
  chipFocusAfterRemoval,
  orderCompared,
  rankWith,
  selectedIds,
  toggleSelected,
} from './modelSelection'

// The published order, which is `MODEL_INFO`'s declaration order: an editorial
// ranking for mountain terrain rather than a sort, so the tests below read the
// chips against THIS list rather than against the alphabet.
const MODELS = [
  { id: 'gfs_seamless' },
  { id: 'ecmwf_ifs025' },
  { id: 'icon_seamless' },
  { id: 'gfs_hrrr' },
]

describe('the chips', () => {
  it('reads the selected models in the published order, whatever the tick order', () => {
    expect(selectedIds(MODELS, 'gfs_hrrr', ['ecmwf_ifs025', 'gfs_seamless'])).toEqual([
      'gfs_seamless',
      'ecmwf_ifs025',
      'gfs_hrrr',
    ])
  })

  it('shows the ranking model as a chip of its own', () => {
    expect(selectedIds(MODELS, 'gfs_seamless', [])).toEqual(['gfs_seamless'])
  })

  // A link can name a model this deployment does not publish. Dropping it would
  // edit the reader's link on their behalf; it keeps its place at the end.
  it('keeps an unpublished id rather than dropping it', () => {
    expect(selectedIds(MODELS, 'gfs_seamless', ['meteofrance_x', 'gfs_hrrr'])).toEqual([
      'gfs_seamless',
      'gfs_hrrr',
      'meteofrance_x',
    ])
  })

  it('never draws one model twice', () => {
    expect(selectedIds(MODELS, 'gfs_seamless', ['gfs_seamless', 'gfs_hrrr'])).toEqual([
      'gfs_seamless',
      'gfs_hrrr',
    ])
  })

  // What `compare=` carries: the same order, minus the model `model=` names.
  it('leaves the ranking model out of the compared list', () => {
    expect(orderCompared(MODELS, 'ecmwf_ifs025', ['gfs_hrrr', 'ecmwf_ifs025'])).toEqual([
      'gfs_hrrr',
    ])
  })
})

describe('ticking a row', () => {
  it('adds a model in the published order rather than at the end', () => {
    const next = toggleSelected(MODELS, 'gfs_hrrr', ['icon_seamless'], 'gfs_seamless')
    expect(next.ranking).toBe('gfs_hrrr')
    expect(next.compared).toEqual(['gfs_seamless', 'icon_seamless'])
  })

  it('unticks a compared model and leaves the ranking alone', () => {
    const next = toggleSelected(MODELS, 'gfs_hrrr', ['gfs_seamless'], 'gfs_seamless')
    expect(next).toEqual({ ranking: 'gfs_hrrr', compared: [] })
  })

  // The one case that moves the highlight. The neighbour on the RIGHT, because
  // the chips read in the published order and that is the next model the list
  // itself would have offered.
  it('passes the ranking to the next chip when the ranking model goes', () => {
    const next = toggleSelected(
      MODELS,
      'ecmwf_ifs025',
      ['gfs_seamless', 'gfs_hrrr'],
      'ecmwf_ifs025',
    )
    expect(next.ranking).toBe('gfs_hrrr')
    expect(next.compared).toEqual(['gfs_seamless'])
  })

  it('wraps to the first chip when the last one was ranking', () => {
    const next = toggleSelected(MODELS, 'gfs_hrrr', ['gfs_seamless'], 'gfs_hrrr')
    expect(next).toEqual({ ranking: 'gfs_seamless', compared: [] })
  })

  // A report has to come from some model, so the set can never empty. The
  // picker also disables the box, and this is what makes the rule true rather
  // than merely undrawn.
  it('refuses to unselect the only model', () => {
    const next = toggleSelected(MODELS, 'gfs_seamless', [], 'gfs_seamless')
    expect(next).toEqual({ ranking: 'gfs_seamless', compared: [] })
  })

  it('says when nothing can be given up', () => {
    expect(canRemove('gfs_seamless', [])).toBe(false)
    expect(canRemove('gfs_seamless', ['gfs_hrrr'])).toBe(true)
    // A compared list that echoes the ranking model is still one model.
    expect(canRemove('gfs_seamless', ['gfs_seamless'])).toBe(false)
  })
})

describe('tapping a chip', () => {
  it('moves the highlight and keeps the old ranking model selected', () => {
    const next = rankWith(MODELS, 'gfs_seamless', ['gfs_hrrr'], 'gfs_hrrr')
    expect(next.ranking).toBe('gfs_hrrr')
    expect(next.compared).toEqual(['gfs_seamless'])
  })

  it('keeps the chips in the published order after the swap', () => {
    const next = rankWith(
      MODELS,
      'gfs_seamless',
      ['ecmwf_ifs025', 'gfs_hrrr'],
      'gfs_hrrr',
    )
    expect(selectedIds(MODELS, next.ranking, next.compared)).toEqual([
      'gfs_seamless',
      'ecmwf_ifs025',
      'gfs_hrrr',
    ])
  })

  it('changes nothing when the chip already ranks', () => {
    const next = rankWith(MODELS, 'gfs_seamless', ['gfs_hrrr'], 'gfs_seamless')
    expect(next).toEqual({ ranking: 'gfs_seamless', compared: ['gfs_hrrr'] })
  })

  // The invariant every caller leans on: `compared` is the EXTRA lines, so the
  // ranking model is never in it whichever gesture got the app here.
  it('never leaves the ranking model in the compared list', () => {
    for (const id of MODELS.map((m) => m.id)) {
      const next = rankWith(MODELS, 'gfs_seamless', ['gfs_hrrr', 'ecmwf_ifs025'], id)
      expect(next.compared).not.toContain(next.ranking)
    }
  })
})

describe('the keyboard after a removal', () => {
  it('lands on the chip that slid into the gap', () => {
    expect(chipFocusAfterRemoval(1, 3)).toBe(1)
  })

  it('lands on the last chip when the tail went', () => {
    expect(chipFocusAfterRemoval(3, 3)).toBe(2)
  })

  it('asks for nothing impossible when the row empties', () => {
    expect(chipFocusAfterRemoval(2, 0)).toBe(0)
  })
})
