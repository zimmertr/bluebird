import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion } from './motion'

// The node project has no window; the browser cases stub one in.
afterEach(() => vi.unstubAllGlobals())

describe('prefersReducedMotion', () => {
  it('is false with no window, and with a window that cannot ask', () => {
    expect(prefersReducedMotion()).toBe(false)
    vi.stubGlobal('window', {})
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reads the reduced-motion media query', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }))
    vi.stubGlobal('window', { matchMedia })
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(prefersReducedMotion()).toBe(false)
  })
})
