import { describe, expect, it, vi } from 'vitest'
import type { RunReport } from '../types'
import { failureFields, reportMapLoad, sendReport, trackRun } from './runReport'
import { AnalysisRefusalError } from './clientAnalyze'
import { ApiUnreachable } from './apiFetch'
import { OpenMeteoHttpError, OpenMeteoTimeout } from './openMeteoErrors'

function clock(start = 1_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

function tracked(discovers: boolean) {
  const sent: RunReport[] = []
  const c = clock()
  const target = new EventTarget()
  const tracker = trackRun({ model: 'gfs_seamless', discovers }, { send: (r) => sent.push(r), now: c.now, target })
  return { sent, c, target, tracker }
}

describe('trackRun', () => {
  it('reports a finished run once, with its duration and its count', () => {
    const { sent, c, tracker } = tracked(true)
    tracker.discovered(140)
    c.advance(5_400)
    tracker.finished(140, null)
    tracker.failed(new Error('late'))
    expect(sent).toEqual([
      {
        kind: 'analysis',
        outcome: 'success',
        stage: null,
        source: null,
        duration_ms: 5_400,
        destinations: 140,
        model: 'gfs_seamless',
      },
    ])
  })

  it('reports a table with a column it could not fill as degraded', () => {
    const { sent, tracker } = tracked(false)
    tracker.finished(12, 'air_quality')
    expect(sent[0]).toMatchObject({ outcome: 'degraded', stage: 'air_quality', source: 'open-meteo' })
  })

  it('blames discovery on the pod until discovery has answered, and the forecasts after', () => {
    const before = tracked(true)
    before.tracker.failed(new Error('OpenStreetMap is not available. Try again later.'))
    expect(before.sent[0]).toMatchObject({ outcome: 'failed', stage: 'discovery', source: 'pod', destinations: null })

    const after = tracked(true)
    after.tracker.discovered(30)
    after.tracker.failed(new OpenMeteoTimeout('Open-Meteo took too long. Try again later.'))
    expect(after.sent[0]).toMatchObject({ outcome: 'failed', stage: 'weather', source: 'open-meteo', destinations: 30 })
  })

  it('counts a run whose page closed while it ran as abandoned, once', () => {
    const { sent, c, target, tracker } = tracked(true)
    c.advance(42_000)
    target.dispatchEvent(new Event('pagehide'))
    tracker.failed(new DOMException('Aborted', 'AbortError'))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ outcome: 'abandoned', stage: 'discovery', duration_ms: 42_000 })
  })
})

describe('failureFields', () => {
  it('names a cancel, a refusal, the forecast host, the pod and anything else', () => {
    expect(failureFields(new DOMException('Aborted', 'AbortError'), 'weather').outcome).toBe('cancelled')
    expect(failureFields(new AnalysisRefusalError('too many'), 'discovery')).toEqual({
      outcome: 'refused',
      stage: 'discovery',
      source: null,
    })
    expect(failureFields(new OpenMeteoHttpError('Open-Meteo error (502). Try again later.', 502), 'weather')).toEqual({
      outcome: 'failed',
      stage: 'weather',
      source: 'open-meteo',
    })
    expect(failureFields(new ApiUnreachable('Bluebird Forecast is offline. Try again later.'), 'weather').source).toBe(
      'pod',
    )
    expect(failureFields(new TypeError('x is undefined'), 'weather')).toEqual({
      outcome: 'failed',
      stage: 'other',
      source: 'other',
    })
  })
})

describe('reportMapLoad', () => {
  it('reports a load and a failure with no destinations and no model', () => {
    const send = vi.fn()
    reportMapLoad(true, 1_234.6, send)
    reportMapLoad(false, 9_000, send)
    expect(send.mock.calls).toEqual([
      [{ kind: 'map', outcome: 'success', stage: null, source: null, duration_ms: 1_235, destinations: null, model: null }],
      [
        {
          kind: 'map',
          outcome: 'failed',
          stage: 'basemap',
          source: 'basemap',
          duration_ms: 9_000,
          destinations: null,
          model: null,
        },
      ],
    ])
  })
})

describe('sendReport', () => {
  it('beacons the report, and falls back to a keepalive fetch where there is no beacon', () => {
    const report: RunReport = {
      kind: 'map',
      outcome: 'success',
      stage: null,
      source: null,
      duration_ms: 1,
      destinations: null,
      model: null,
    }
    const sendBeacon = vi.fn(() => true)
    sendReport(report, { sendBeacon } as unknown as Navigator)
    expect(sendBeacon).toHaveBeenCalledWith('/api/reports', expect.any(Blob))

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    sendReport(report, {} as Navigator)
    expect(fetchSpy).toHaveBeenCalledWith('/api/reports', expect.objectContaining({ method: 'POST', keepalive: true }))
    fetchSpy.mockRestore()
  })

  it('never throws, whatever the network does', () => {
    const report = { kind: 'map' } as RunReport
    const sendBeacon = vi.fn(() => {
      throw new Error('blocked')
    })
    expect(() => sendReport(report, { sendBeacon } as unknown as Navigator)).not.toThrow()
  })
})
