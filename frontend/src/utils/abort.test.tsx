import { describe, expect, it } from 'vitest'
import { isAbort } from './abort'
import { analysisFailure } from './analysisFailure'

// `.tsx` on purpose: the DOM project is the realm where the global
// DOMException is jsdom's while AbortController is Node's, so a real abort is
// not `instanceof DOMException` here, which is what the name check is for.
describe('a real abort in the DOM project', () => {
  it('is a cancel, though it is no instance of the global DOMException', () => {
    const controller = new AbortController()
    controller.abort()
    const reason: unknown = controller.signal.reason
    expect(reason instanceof DOMException).toBe(false)
    expect(isAbort(reason)).toBe(true)
    expect(analysisFailure(reason, []).kind).toBe('cancel')
  })

  it('reads a thrown abort the same way', () => {
    const controller = new AbortController()
    controller.abort()
    let thrown: unknown
    try {
      controller.signal.throwIfAborted()
    } catch (e) {
      thrown = e
    }
    expect(isAbort(thrown)).toBe(true)
  })

  it('is not a cancel for a deadline, or for nothing at all', () => {
    expect(isAbort(AbortSignal.timeout(0).reason)).toBe(false)
    expect(isAbort(new DOMException('late', 'TimeoutError'))).toBe(false)
    expect(isAbort(null)).toBe(false)
    expect(isAbort(undefined)).toBe(false)
    expect(isAbort('AbortError')).toBe(false)
  })
})
