import { describe, it, expect } from 'vitest'
import {
  AQI_TAIL_MESSAGE,
  CLOUD_TAIL_MESSAGE,
  composeOverlay,
  ELEVATION_MESSAGE,
  OverlayInputs,
  RETRIEVING_MESSAGE,
  SEARCHING_MESSAGE,
  tailMessage,
} from './analyzeOverlay'

const idle: OverlayInputs = {
  analyzeLoading: false,
  statusMessage: null,
  elapsedS: 0,
  rankedProgress: null,
}

describe('composeOverlay', () => {
  it('is hidden when no analysis is running', () => {
    expect(composeOverlay(idle)).toEqual({ visible: false })
  })

  it('shows the backend phase status before any batch progress exists', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: SEARCHING_MESSAGE,
    })
    expect(view).toEqual({
      visible: true,
      message: 'Searching for destinations…',
      detail: null,
      progress: null,
    })
  })

  // The three phase labels in sentence case, as the rest of the app writes
  // (the maintainer, 2026-10-01, #579), each spelled once beside the others.
  it('spells the phase labels in sentence case', () => {
    expect(SEARCHING_MESSAGE).toBe('Searching for destinations…')
    expect(ELEVATION_MESSAGE).toBe('Retrieving elevation…')
    expect(RETRIEVING_MESSAGE).toBe('Retrieving forecasts…')
  })

  // A run with no polygon waits on the elevation lookup first, and no staged
  // "still searching" line belongs under it: it searches for nothing.
  it('shows the elevation label as it is, with nothing staged under it', () => {
    const view = composeOverlay({ ...idle, analyzeLoading: true, statusMessage: ELEVATION_MESSAGE, elapsedS: 60 })
    expect(view).toEqual({ visible: true, message: 'Retrieving elevation…', detail: null, progress: null })
  })

  it('falls back to a generic retrieving label in the status gap', () => {
    const view = composeOverlay({ ...idle, analyzeLoading: true })
    expect(view).toEqual({
      visible: true,
      message: 'Retrieving forecasts…',
      detail: null,
      progress: null,
    })
  })

  it('names the total and carries batch progress in the weather phase', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: 'ignored once progress exists',
      rankedProgress: { processed: 50, total: 200 },
    })
    expect(view).toEqual({
      visible: true,
      message: 'Retrieving 200 forecasts…',
      detail: null,
      progress: { processed: 50, total: 200, percent: 25 },
    })
  })

  it('uses the singular label for exactly one forecast', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      rankedProgress: { processed: 0, total: 1 },
    })
    expect(view.visible && view.message).toBe('Retrieving forecast…')
  })

  it('shows reassurance once a search runs long', () => {
    const search = { ...idle, analyzeLoading: true, statusMessage: SEARCHING_MESSAGE }
    const early = composeOverlay({ ...search, elapsedS: 19 })
    expect(early.visible && early.detail).toBe(null)
    const staged = composeOverlay({ ...search, elapsedS: 20 })
    expect(staged.visible && staged.detail).toBe(
      'Still searching. Large analyses can take a while.'
    )
    // Same message after more time has elapsed
    const long = composeOverlay({ ...search, elapsedS: 45 })
    expect(long.visible && long.detail).toBe(
      'Still searching. Large analyses can take a while.'
    )
  })

  it('never stages the searching reassurance outside the search phase', () => {
    // The retrieval gap (statusMessage null) and a custom run's seeded
    // "Retrieving forecasts…" heading must not claim we are still searching.
    const gap = composeOverlay({ ...idle, analyzeLoading: true, elapsedS: 30 })
    expect(gap.visible && gap.detail).toBe(null)
    const custom = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: 'Retrieving forecasts…',
      elapsedS: 30,
    })
    expect(custom.visible && custom.detail).toBe(null)
  })

  it('renders the pace countdown during retrieval', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      rankedProgress: { processed: 550, total: 908 },
      paceRemainingS: 34,
    })
    expect(view.visible && view.detail).toBe('Open-Meteo quota: resuming in 34s')
    const done = composeOverlay({
      ...idle,
      analyzeLoading: true,
      rankedProgress: { processed: 550, total: 908 },
      paceRemainingS: 0,
    })
    expect(done.visible && done.detail).toBe(null)
  })
})

// What the run still waits on once the weather has answered (#579): air
// quality first, then the cloud column, one label at a time.
describe('the tail label', () => {
  it('names air quality while it is the one still out', () => {
    expect(tailMessage({ aqi: true, cloud: false })).toBe('Retrieving air quality…')
  })

  it('names the cloud data while it is the one still out', () => {
    expect(tailMessage({ aqi: false, cloud: true })).toBe('Retrieving cloud data…')
  })

  it('names air quality first while both are out', () => {
    expect(tailMessage({ aqi: true, cloud: true })).toBe(AQI_TAIL_MESSAGE)
  })

  it('names nothing once neither is out', () => {
    expect(tailMessage({ aqi: false, cloud: false })).toBeNull()
  })

  it('replaces the forecast count and keeps the full bar', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: CLOUD_TAIL_MESSAGE,
      rankedProgress: { processed: 40, total: 40 },
    })
    expect(view).toMatchObject({
      message: 'Retrieving cloud data…',
      progress: { processed: 40, total: 40, percent: 100 },
    })
  })

  it('keeps the forecast count under any other status', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: 'Retrieving forecasts: 40 of 40 peaks…',
      rankedProgress: { processed: 40, total: 40 },
    })
    expect(view).toMatchObject({ message: 'Retrieving 40 forecasts…' })
  })
})
