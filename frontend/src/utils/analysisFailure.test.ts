import { describe, expect, it } from 'vitest'
import { analysisFailure } from './analysisFailure'
import { AnalysisRefusalError } from './clientAnalyze'
import { COVERAGE_MESSAGE_TAIL, OpenMeteoModelCoverage } from './openMeteoErrors'
import { forecastModel } from '../testSupport/fixtures'

const MODELS = [forecastModel({ id: 'gfs_hrrr', label: 'NOAA HRRR' })]

describe('analysisFailure', () => {
  it('reads a cancel as no failure to show', () => {
    expect(analysisFailure(new DOMException('stop', 'AbortError'), MODELS)).toEqual({ kind: 'cancel' })
  })

  it('puts a refusal in the warn box with its own message', () => {
    expect(analysisFailure(new AnalysisRefusalError('Too many.'), MODELS)).toEqual({
      kind: 'refusal',
      message: 'Too many.',
    })
  })

  it('names the model by its label in the coverage sentence', () => {
    expect(analysisFailure(new OpenMeteoModelCoverage('gfs_hrrr'), MODELS)).toEqual({
      kind: 'error',
      message: `NOAA HRRR ${COVERAGE_MESSAGE_TAIL}`,
    })
  })

  it('falls back to the model id when the list does not know it', () => {
    expect(analysisFailure(new OpenMeteoModelCoverage('ukmo_seamless'), MODELS)).toEqual({
      kind: 'error',
      message: `ukmo_seamless ${COVERAGE_MESSAGE_TAIL}`,
    })
  })

  it('shows any other error by its message, and a non-error generically', () => {
    expect(analysisFailure(new Error('Broken.'), MODELS)).toEqual({ kind: 'error', message: 'Broken.' })
    expect(analysisFailure('nope', MODELS)).toEqual({ kind: 'error', message: 'Unknown error' })
  })

  it('treats an abort-shaped plain error as an error, not a cancel', () => {
    const fake = new Error('aborted')
    fake.name = 'AbortError'
    expect(analysisFailure(fake, MODELS).kind).toBe('error')
  })
})
