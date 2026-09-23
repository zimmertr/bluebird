import { describe, expect, it } from 'vitest'
import { type AnalyzeInputs, planAnalysis } from './analyzeRequest'
import { discoveryBase } from './clientAnalyze'
import { NO_CONSTRAINTS } from './constraints'
import { geoKey } from './points'
import { discoveryKeys } from './present'
import { place, resultRow } from '../testSupport/fixtures'
import type { GeoPolygon } from '../types'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}
const WINDOW = { start: '2026-07-20T06:00:00.000Z', end: '2026-07-20T18:00:00.000Z' }
const KEPT = resultRow({ name: 'Kept' })
const STRUCK = resultRow({ name: 'Struck', latitude: 47.5, longitude: -121.8 })
const SHOWN = resultRow({ name: 'Shown' })

function inputs(over: Partial<AnalyzeInputs> = {}): AnalyzeInputs {
  return {
    kind: 'days',
    window: WINDOW,
    polygon: RING,
    destinationTypes: ['peak'],
    includeUnnamedPeaks: false,
    csvRows: [],
    places: [],
    destinationScope: 'scope',
    forecastModel: 'gfs_seamless',
    comparedModels: [],
    limit: 200,
    sortBy: 'precip_total_in',
    sortDesc: false,
    constraints: NO_CONSTRAINTS,
    universe: null,
    results: [],
    removedKeys: new Set(),
    hasResults: false,
    previous: null,
    ...over,
  }
}

// The record the discovery above leaves, so the next click can refresh.
const RECORD = { base: discoveryBase(RING, [], ['peak'], false), searchedKeys: [] }

describe('planAnalysis', () => {
  it('discovers a first ring, and records it after the run', () => {
    const plan = planAnalysis(inputs())
    expect(plan.branch).toBe('discovery')
    expect(plan.willRank).toBe(true)
    expect(plan.run?.request).toMatchObject({
      polygon: RING,
      destination_types: ['peak'],
      start_datetime: WINDOW.start,
      end_datetime: WINDOW.end,
      forecast_model: 'gfs_seamless',
    })
    expect(plan.run?.request.custom_destinations).toBeUndefined()
    expect(plan.record).toEqual({ when: 'after', value: RECORD })
  })

  it('carries the custom list along with a discovery', () => {
    const plan = planAnalysis(inputs({ places: [place()] }))
    expect(plan.run?.request.custom_destinations).toHaveLength(1)
  })

  // #177: the echo is the held field less the removals, never the rows the
  // last cut left on screen.
  it('refreshes an unchanged ring by echoing the universe less the removals', () => {
    const plan = planAnalysis(
      inputs({
        previous: RECORD,
        hasResults: true,
        universe: [KEPT, STRUCK],
        results: [SHOWN],
        removedKeys: new Set([geoKey(STRUCK.latitude, STRUCK.longitude)]),
      }),
    )
    expect(plan.branch).toBe('refresh')
    expect(plan.run?.request.polygon).toBeUndefined()
    expect(plan.run?.request.destination_types).toEqual([])
    expect(plan.run?.request.custom_destinations?.map((d) => d.name)).toEqual(['Kept'])
    // The snapshot answers for the ring it echoes, not the custom request.
    expect(plan.run?.options.discovery).toEqual(discoveryKeys(RING, ['peak'], false))
    expect(plan.record).toEqual({ when: 'before', value: RECORD })
  })

  it('discovers again when nothing is on screen, or a new place joins', () => {
    expect(planAnalysis(inputs({ previous: RECORD })).branch).toBe('discovery')
    const added = inputs({ previous: RECORD, hasResults: true, universe: [KEPT], places: [place()] })
    expect(planAnalysis(added).branch).toBe('discovery')
  })

  it('runs a custom list with no ring, and forgets the discovery', () => {
    const plan = planAnalysis(inputs({ polygon: null, places: [place()], previous: RECORD }))
    expect(plan.branch).toBe('custom')
    expect(plan.run?.request.custom_destinations).toHaveLength(1)
    expect(plan.record).toEqual({ when: 'before', value: null })
  })

  it('runs nothing with no ring and no list', () => {
    const plan = planAnalysis(inputs({ polygon: null }))
    expect(plan).toMatchObject({ branch: 'nothing', willRank: false, run: null, record: null })
  })

  // Removing a searched place shrinks the list, and that must not count as
  // the discovery change that clears the removals.
  it('keeps searched places out of the removal scope', () => {
    const one = planAnalysis(inputs({ places: [place()] })).removalScope
    expect(planAnalysis(inputs()).removalScope).toBe(one)
    expect(planAnalysis(inputs({ polygon: null })).removalScope).not.toBe(one)
    expect(planAnalysis(inputs({ destinationScope: 'other' })).removalScope).not.toBe(one)
  })

  it('records the compared models on every run', () => {
    const plan = planAnalysis(inputs({ comparedModels: ['icon_seamless'] }))
    expect(plan.run?.options.compareModels).toEqual(['icon_seamless'])
  })
})
