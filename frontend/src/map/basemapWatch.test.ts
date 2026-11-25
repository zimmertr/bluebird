import { describe, expect, it, vi } from 'vitest'
import { FALLBACK_AFTER_RETRIES, STYLE_RETRY_S, watchBasemap } from './basemapWatch'
import { creditBasemap } from '../utils/basemapCredit'
import { stubMap } from '../testSupport/stubMap'

const STYLE = 'https://tiles.example/style'
const FALLBACK = { version: 8 as const, sources: {}, layers: [] }

function setup() {
  const stub = stubMap()
  const online = new EventTarget()
  const onFailed = vi.fn()
  const watch = watchBasemap(stub.map, { style: STYLE, fallback: FALLBACK, onFailed, online })
  const reloads = () => stub.calls.filter((c) => c[0] === 'setStyle')
  return { stub, online, onFailed, watch, reloads }
}

describe('watchBasemap', () => {
  it('reports a style that failed and asks for it again once per reconnect', async () => {
    const { stub, online, onFailed, reloads } = setup()
    stub.fire('error', undefined, { error: new Error('Failed to fetch') })
    expect(onFailed).toHaveBeenLastCalledWith(true)
    expect(reloads()).toEqual([])
    online.dispatchEvent(new Event('online'))
    online.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 0))
    // The failed style is dropped first, or MapLibre would hold the reload
    // for a load that never comes; the reload rewrites the credit as the
    // first load did.
    expect(reloads()).toEqual([
      ['setStyle', null, undefined],
      ['setStyle', STYLE, { diff: false, transformStyle: creditBasemap }],
    ])
  })

  it('clears the failure when the style arrives, and stops asking', async () => {
    const { stub, online, onFailed, reloads } = setup()
    stub.fire('error', undefined, {})
    stub.fire('style.load')
    expect(onFailed).toHaveBeenLastCalledWith(false)
    online.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 0))
    expect(reloads()).toEqual([])
  })

  it('ignores a tile or source error, and any error once the style has loaded', () => {
    const { stub, onFailed } = setup()
    stub.fire('error', undefined, { sourceId: 'openmaptiles' })
    stub.fire('style.load')
    stub.fire('error', undefined, {})
    expect(onFailed).not.toHaveBeenCalledWith(true)
  })

  // Record 0348: on a steady connection no `online` ever comes, so a style
  // that failed for a few seconds left the map blank for good.
  it('asks for a failed style again on its own, waiting longer each time, until it loads', async () => {
    vi.useFakeTimers()
    try {
      const { stub, reloads } = setup()
      const asks = () => reloads().filter((c) => c[1] === STYLE).length
      stub.fire('error', undefined, { error: new Error('Failed to fetch') })
      await vi.advanceTimersByTimeAsync(STYLE_RETRY_S[0] * 1000 - 1)
      expect(asks()).toBe(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(asks()).toBe(1)
      stub.fire('error', undefined, { error: new Error('Failed to fetch') })
      await vi.advanceTimersByTimeAsync(STYLE_RETRY_S[1] * 1000 - 1)
      expect(asks()).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(asks()).toBe(2)
      stub.fire('style.load')
      await vi.advanceTimersByTimeAsync(STYLE_RETRY_S[STYLE_RETRY_S.length - 1] * 1000 * 2)
      expect(asks()).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  // Record 0348: past its retries the map takes the fallback for the visit,
  // so `load` fires and the ring tool mounts, and the failure stays reported.
  it('takes the fallback once the retries run out, and asks for the style no more', async () => {
    vi.useFakeTimers()
    try {
      const { stub, online, onFailed, reloads } = setup()
      const fail = () => stub.fire('error', undefined, { error: new Error('Failed to fetch') })
      fail()
      for (let i = 0; i < FALLBACK_AFTER_RETRIES; i++) {
        await vi.advanceTimersByTimeAsync(STYLE_RETRY_S[i] * 1000)
        fail()
      }
      expect(reloads().filter((c) => c[1] === STYLE)).toHaveLength(FALLBACK_AFTER_RETRIES)
      expect(reloads().slice(-2)).toEqual([
        ['setStyle', null, undefined],
        ['setStyle', FALLBACK, { diff: false }],
      ])
      stub.fire('style.load')
      expect(onFailed).toHaveBeenLastCalledWith(true)
      const asked = reloads().length
      online.dispatchEvent(new Event('online'))
      fail()
      await vi.advanceTimersByTimeAsync(STYLE_RETRY_S[STYLE_RETRY_S.length - 1] * 1000 * 3)
      expect(reloads()).toHaveLength(asked)
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks nothing more once the map is gone', async () => {
    const { stub, online, watch, reloads } = setup()
    stub.fire('error', undefined, {})
    watch.dispose()
    online.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 0))
    expect(reloads()).toEqual([])
  })

  it('tells its first outcome once, a load or a failure, whichever comes first', () => {
    const stub = stubMap()
    const onFirstOutcome = vi.fn()
    watchBasemap(stub.map, { style: STYLE, fallback: FALLBACK, onFailed: vi.fn(), online: new EventTarget(), onFirstOutcome })
    stub.fire('error', undefined, { error: new Error('Failed to fetch') })
    stub.fire('style.load')
    stub.fire('error', undefined, { error: new Error('Failed to fetch') })
    expect(onFirstOutcome.mock.calls).toEqual([[false]])
  })
})
