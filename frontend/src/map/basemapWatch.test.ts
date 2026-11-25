import { describe, expect, it, vi } from 'vitest'
import { STYLE_RETRY_S, watchBasemap } from './basemapWatch'
import { creditBasemap } from '../utils/basemapCredit'
import { stubMap } from '../testSupport/stubMap'

const STYLE = 'https://tiles.example/style'

function setup() {
  const stub = stubMap()
  const online = new EventTarget()
  const onFailed = vi.fn()
  const watch = watchBasemap(stub.map, { style: STYLE, onFailed, online })
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
    watchBasemap(stub.map, { style: STYLE, onFailed: vi.fn(), online: new EventTarget(), onFirstOutcome })
    stub.fire('error', undefined, { error: new Error('Failed to fetch') })
    stub.fire('style.load')
    stub.fire('error', undefined, { error: new Error('Failed to fetch') })
    expect(onFirstOutcome.mock.calls).toEqual([[false]])
  })
})
