import { describe, expect, it } from 'vitest'
import { ALL_ANSWERED, unansweredMetrics } from './metricReach'

// Which metrics the window and the models cannot answer (#803, record 0235):
// the one answer the Metrics table greys and the Analyze gate blocks on.

const GFS = { id: 'gfs_seamless', label: 'NOAA GFS' }
const ECMWF = { id: 'ecmwf_ifs025', label: 'ECMWF IFS' }

describe('unansweredMetrics', () => {
  it('answers everything on a forecast window under a model with a freezing level', () => {
    expect(unansweredMetrics({ source: 'forecast', aqiCoverage: 'full', models: [GFS] })).toBe(ALL_ANSWERED)
    expect(unansweredMetrics({ source: null, aqiCoverage: 'full', models: [GFS] })).toBe(ALL_ANSWERED)
  })

  // W1, W2: the archive publishes neither column. Air quality and snowfall it
  // does answer, so they stay.
  it('takes the cloud deck and the freezing level out on an archive window', () => {
    const out = unansweredMetrics({ source: 'archive', aqiCoverage: 'full', models: [GFS] })
    expect([...out]).toEqual([
      ['cloud_deck', 'archive'],
      ['freeze', 'archive'],
    ])
  })

  // The archive's reason wins over the model's: no model applies there, and
  // the line that names a model would point at a disabled picker.
  it('blames the archive, not the model, for the freezing level there', () => {
    expect(unansweredMetrics({ source: 'archive', aqiCoverage: 'full', models: [ECMWF] }).get('freeze')).toBe(
      'archive',
    )
  })

  // Record 0072: the forecast half answers both, and the seam line names the join.
  it('greys nothing for a window that spans the archive boundary', () => {
    expect(unansweredMetrics({ source: 'spanning', aqiCoverage: 'full', models: [GFS] })).toBe(ALL_ANSWERED)
  })

  it('takes the freezing level out when any model fetched publishes none', () => {
    expect([...unansweredMetrics({ source: 'forecast', aqiCoverage: 'full', models: [ECMWF] })]).toEqual([
      ['freeze', 'model'],
    ])
    expect([...unansweredMetrics({ source: 'spanning', aqiCoverage: 'full', models: [GFS, ECMWF] })]).toEqual([
      ['freeze', 'model'],
    ])
  })

  // W5: only a window wholly past the horizon. A partial one still has hours.
  it('takes air quality out for a window wholly past its horizon', () => {
    expect([...unansweredMetrics({ source: 'forecast', aqiCoverage: 'none', models: [GFS] })]).toEqual([
      ['aqi', 'horizon'],
    ])
    expect(unansweredMetrics({ source: 'forecast', aqiCoverage: 'partial', models: [GFS] })).toBe(ALL_ANSWERED)
  })
})
