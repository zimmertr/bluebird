import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ProximityFound, type ProximityLookup, useProximityCheck } from './useProximityCheck'

const POINT = { latitude: 46.85, longitude: -121.76 }
const FIELD = [POINT]
const FOUND: ProximityFound<string> = {
  warnings: new Map([['46.85,-121.76', 'near']]),
  uncovered: new Set(),
}

/** What the overlay fetchers throw for a 429 or a 503, with the pod's `Retry-After`. */
function refusal(retryAfterS: number | null): Error {
  return Object.assign(new Error('refused'), { rateLimited: true, retryAfterS })
}

/** A lookup whose answers come from `answers` in order, the last one repeating. */
function lookupOf(...answers: (ProximityFound<string> | Error | Promise<ProximityFound<string>>)[]) {
  let call = 0
  const find = vi.fn(async () => {
    const next = answers[Math.min(call++, answers.length - 1)]
    if (next instanceof Error) throw next
    return next
  })
  const lookup: ProximityLookup<string> = { label: 'probe lookup', marginMi: 1, find }
  return { lookup, find }
}

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useProximityCheck, after the check gives up', () => {
  // The stuck state #642 reported: one refusal used to hold `unavailable`
  // until the next Analyze.
  it('asks again when the pod’s Retry-After runs out, and clears by itself', async () => {
    const { lookup, find } = lookupOf(refusal(30), FOUND)
    const { result } = renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    expect(result.current.status).toBe('unavailable')
    expect(find).toHaveBeenCalledTimes(1)
    await flush(29_000)
    expect(find).toHaveBeenCalledTimes(1)
    await flush(1_000)
    expect(find).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('ready')
    expect(result.current.warnings.get('46.85,-121.76')).toBe('near')
  })

  it('waits a minute when the failure named no wait', async () => {
    const down = new Error('network')
    const { lookup, find } = lookupOf(down, down, down, FOUND)
    const { result } = renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    await flush(1_000)
    await flush(3_000)
    expect(find).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe('unavailable')
    await flush(59_000)
    expect(find).toHaveBeenCalledTimes(3)
    await flush(1_000)
    expect(find).toHaveBeenCalledTimes(4)
    expect(result.current.status).toBe('ready')
  })

  // One try per wait, and the same state object throughout: a status that
  // went back to `loading` would blink the cells and the panel's notice once
  // a minute for as long as the outage lasts.
  it('stays unavailable through a silent attempt that fails, and keeps asking', async () => {
    const { lookup, find } = lookupOf(refusal(60))
    const { result } = renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    const held = result.current
    expect(held.status).toBe('unavailable')
    await flush(60_000)
    expect(find).toHaveBeenCalledTimes(2)
    expect(result.current).toBe(held)
    await flush(60_000)
    expect(find).toHaveBeenCalledTimes(3)
    expect(result.current).toBe(held)
  })

  it('asks again as soon as the browser comes back online', async () => {
    const down = new Error('network')
    const { lookup, find } = lookupOf(down, down, down, FOUND)
    const { result } = renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    await flush(1_000)
    await flush(3_000)
    expect(result.current.status).toBe('unavailable')
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await flush()
    expect(find).toHaveBeenCalledTimes(4)
    expect(result.current.status).toBe('ready')
    // The minute's own timer went with the attempt that answered.
    await flush(60_000)
    expect(find).toHaveBeenCalledTimes(4)
  })

  it('does not ask on reconnect inside a wait the pod named', async () => {
    const { lookup, find } = lookupOf(refusal(30), FOUND)
    renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await flush(29_000)
    expect(find).toHaveBeenCalledTimes(1)
    await flush(1_000)
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('waits a second on a refusal that names a wait of zero', async () => {
    const { lookup, find } = lookupOf(refusal(0))
    renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    await flush(999)
    expect(find).toHaveBeenCalledTimes(1)
    await flush(1)
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('stops asking when it unmounts', async () => {
    const { lookup, find } = lookupOf(refusal(30))
    const { unmount } = renderHook(() => useProximityCheck(lookup, FIELD, 0, false))
    await flush()
    unmount()
    await flush(120_000)
    expect(find).toHaveBeenCalledTimes(1)
  })
})

describe('useProximityCheck, when its layer comes on', () => {
  // `loading` rather than `unavailable` while this attempt runs, or the
  // panel's notice would flash between the switch and the answer.
  it('asks a failed check again at once, as loading', async () => {
    let land: (found: ProximityFound<string>) => void = () => {}
    const second = new Promise<ProximityFound<string>>((resolve) => {
      land = resolve
    })
    const { lookup, find } = lookupOf(refusal(60), second)
    const { result, rerender } = renderHook(
      (layerOn: boolean) => useProximityCheck(lookup, FIELD, 0, layerOn),
      { initialProps: false },
    )
    await flush()
    expect(result.current.status).toBe('unavailable')
    rerender(true)
    await flush()
    expect(find).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('loading')
    land(FOUND)
    await flush()
    expect(result.current.status).toBe('ready')
    // The wait the refusal named was dropped with it.
    await flush(60_000)
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('runs the quick tries again, and gives up again if they fail', async () => {
    const down = new Error('network')
    const { lookup, find } = lookupOf(refusal(60), down)
    const { result, rerender } = renderHook(
      (layerOn: boolean) => useProximityCheck(lookup, FIELD, 0, layerOn),
      { initialProps: false },
    )
    await flush()
    rerender(true)
    await flush()
    await flush(1_000)
    expect(result.current.status).toBe('loading')
    await flush(3_000)
    expect(find).toHaveBeenCalledTimes(4)
    expect(result.current.status).toBe('unavailable')
  })

  it('asks nothing over a check that answered', async () => {
    const { lookup, find } = lookupOf(FOUND)
    const { result, rerender } = renderHook(
      (layerOn: boolean) => useProximityCheck(lookup, FIELD, 0, layerOn),
      { initialProps: false },
    )
    await flush()
    expect(result.current.status).toBe('ready')
    rerender(true)
    await flush()
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('asks once when the layer was on from the start', async () => {
    const { lookup, find } = lookupOf(FOUND)
    renderHook(() => useProximityCheck(lookup, FIELD, 0, true))
    await flush()
    expect(find).toHaveBeenCalledTimes(1)
  })
})
