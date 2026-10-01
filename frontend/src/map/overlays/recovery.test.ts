import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { overlayRecovery, retryAfterOf } from './recovery'

// The rule every pod overlay recovers by (#580): one attempt per `online`,
// one per Retry-After for the overlay that has no pan to ask again, and never
// before the wait the pod named.
let now = 0
beforeEach(() => {
  vi.useFakeTimers()
  now = 1_000_000
})
afterEach(() => vi.useRealTimers())

function setup(timed: boolean) {
  const online = new EventTarget()
  const retry = vi.fn()
  const recovery = overlayRecovery(retry, { timed, online, now: () => now })
  const goOnline = () => online.dispatchEvent(new Event('online'))
  const advance = (ms: number) => {
    now += ms
    vi.advanceTimersByTime(ms)
  }
  return { recovery, retry, goOnline, advance }
}

describe('overlayRecovery', () => {
  it('asks again once when the pod’s Retry-After runs out, if timed', () => {
    const { recovery, retry, advance } = setup(true)
    recovery.failed(60)
    advance(59_999)
    expect(retry).not.toHaveBeenCalled()
    advance(1)
    expect(retry).toHaveBeenCalledTimes(1)
    advance(600_000)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('sets no timer for an overlay a pan already re-asks', () => {
    const { recovery, retry, advance } = setup(false)
    recovery.failed(60)
    advance(600_000)
    expect(retry).not.toHaveBeenCalled()
  })

  it('asks again on reconnect, once however often the browser says so', () => {
    const { recovery, retry, goOnline, advance } = setup(false)
    recovery.failed(null)
    goOnline()
    goOnline()
    goOnline()
    advance(0)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('holds a reconnect inside the pod’s wait until the wait is over', () => {
    const { recovery, retry, goOnline, advance } = setup(false)
    recovery.failed(30)
    advance(10_000)
    goOnline()
    advance(19_999)
    expect(retry).not.toHaveBeenCalled()
    advance(1)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('ignores a reconnect with nothing outstanding', () => {
    const { recovery, retry, goOnline, advance } = setup(true)
    goOnline()
    recovery.failed(null)
    recovery.succeeded()
    goOnline()
    advance(600_000)
    expect(retry).not.toHaveBeenCalled()
  })

  it('drops the timer and the listener when the overlay goes off', () => {
    const { recovery, retry, goOnline, advance } = setup(true)
    recovery.failed(60)
    recovery.stop()
    goOnline()
    advance(600_000)
    expect(retry).not.toHaveBeenCalled()
  })

  it('runs under node with no window to listen on', () => {
    const retry = vi.fn()
    const recovery = overlayRecovery(retry, { timed: true, now: () => now })
    recovery.failed(null)
    recovery.stop()
    expect(retry).not.toHaveBeenCalled()
  })
})

describe('retryAfterOf', () => {
  it('reads the seconds a failed fetch carried, and nothing else', () => {
    expect(retryAfterOf(Object.assign(new Error('x'), { retryAfterS: 60 }))).toBe(60)
    expect(retryAfterOf(Object.assign(new Error('x'), { retryAfterS: null }))).toBeNull()
    expect(retryAfterOf(new Error('x'))).toBeNull()
    expect(retryAfterOf(null)).toBeNull()
  })
})
