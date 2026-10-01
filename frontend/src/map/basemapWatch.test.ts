import { describe, expect, it, vi } from 'vitest'
import { watchBasemap } from './basemapWatch'
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
    expect(reloads()).toEqual([['setStyle', STYLE, { diff: false }]])
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

  it('asks nothing more once the map is gone', async () => {
    const { stub, online, watch, reloads } = setup()
    stub.fire('error', undefined, {})
    watch.dispose()
    online.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 0))
    expect(reloads()).toEqual([])
  })
})
