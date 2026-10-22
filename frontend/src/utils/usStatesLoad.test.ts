import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import outlines from './usStateOutlines.json'
import { fakeResponse } from '../testSupport/fixtures'

// The loader holds what it fetched for the session, so each test takes a
// fresh copy of the module.
async function freshLoader() {
  vi.resetModules()
  return import('./usStatesLoad')
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadUsStates', () => {
  it('fetches the outlines once, holds them, and tells every listener', async () => {
    const { loadUsStates, subscribeUsStates, usStatesNow } = await freshLoader()
    const fetchMock = vi.fn(async () => fakeResponse(outlines))
    vi.stubGlobal('fetch', fetchMock)
    const listener = vi.fn()
    subscribeUsStates(listener)

    expect(usStatesNow()).toBeNull()
    const [first, second] = await Promise.all([loadUsStates(), loadUsStates()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(usStatesNow()).toBe(first)
    expect(first!.map((s) => s.name)).toContain('Washington')
    expect(listener).toHaveBeenCalledTimes(1)

    await loadUsStates()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers null on a failure, holds nothing, and asks again next time', async () => {
    const { loadUsStates, usStatesNow } = await freshLoader()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, 404))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(fakeResponse(outlines))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadUsStates()).resolves.toBeNull()
    await expect(loadUsStates()).resolves.toBeNull()
    expect(usStatesNow()).toBeNull()
    await expect(loadUsStates()).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops telling a listener that unsubscribed', async () => {
    const { loadUsStates, subscribeUsStates } = await freshLoader()
    const listener = vi.fn()
    subscribeUsStates(listener)()
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(outlines)))
    await loadUsStates()
    expect(listener).not.toHaveBeenCalled()
  })
})
