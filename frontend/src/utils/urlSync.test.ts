import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounceUrlWrite, urlNeedsSync } from './urlSync'
// `?raw` reads the file's text without executing it, the drift-guard idiom
// metrics.test.ts uses.
import appSource from '../App.tsx?raw'

describe('urlNeedsSync', () => {
  it('returns false when the encoded query string matches the current search', () => {
    expect(urlNeedsSync('foo=bar', '/', '?foo=bar')).toBe(false)
  })

  it('returns true when the encoded query string differs from the current search', () => {
    expect(urlNeedsSync('foo=bar', '/', '?foo=baz')).toBe(true)
  })

  it('returns true when a query string would be added to a URL with no query', () => {
    expect(urlNeedsSync('foo=bar', '/', '')).toBe(true)
  })

  it('returns true when the query string would be cleared', () => {
    expect(urlNeedsSync('', '/', '?foo=bar')).toBe(true) // clearing search requires a sync
  })

  it('returns false when clearing query string with no existing search', () => {
    expect(urlNeedsSync('', '/', '')).toBe(false)
  })

  it('handles multiple query parameters', () => {
    expect(urlNeedsSync('foo=1&bar=2', '/', '?foo=1&bar=2')).toBe(false)
    expect(urlNeedsSync('foo=1&bar=3', '/', '?foo=1&bar=2')).toBe(true)
  })

  it('preserves pathname when syncing', () => {
    expect(urlNeedsSync('search=peak', '/app/', '?search=peak')).toBe(false)
    expect(urlNeedsSync('search=lake', '/app/', '?search=peak')).toBe(true)
  })

  it('handles URLs with no pathname', () => {
    const pathname = '/'
    expect(urlNeedsSync('a=1', pathname, '?a=1')).toBe(false)
    expect(urlNeedsSync('a=1', pathname, '')).toBe(true)
  })

  it('handles URL encoding special characters', () => {
    const encoded = 'csv=1%2C2%2C3'
    expect(urlNeedsSync(encoded, '/', `?${encoded}`)).toBe(false)
    expect(urlNeedsSync(encoded, '/', '')).toBe(true)
  })
})

describe('debounceUrlWrite', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('writes nothing until the caller stops', () => {
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    queue('?a=1')
    vi.advanceTimersByTime(399)
    expect(write).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledExactlyOnceWith('?a=1')
  })

  it('collapses a burst into one write of the final URL', () => {
    // The regression this file exists for: a per-keystroke burst used to write
    // once per keystroke because the timer was torn down and flushed on every
    // React effect re-run.
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    for (const url of ['?csv=a', '?csv=ab', '?csv=abc', '?csv=abcd']) {
      queue(url)
      vi.advanceTimersByTime(50)
    }
    expect(write).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(write).toHaveBeenCalledExactlyOnceWith('?csv=abcd')
  })

  it('writes each burst separately once the caller pauses between them', () => {
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    queue('?a=1')
    vi.advanceTimersByTime(400)
    queue('?a=2')
    vi.advanceTimersByTime(400)
    expect(write.mock.calls).toEqual([['?a=1'], ['?a=2']])
  })

  it('flushes a queued write immediately, for unmount', () => {
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    queue('?a=1')
    queue('?a=2')
    queue.flush()
    expect(write).toHaveBeenCalledExactlyOnceWith('?a=2')
    // The queue is spent: the timer must not fire a second write after it.
    vi.advanceTimersByTime(400)
    expect(write).toHaveBeenCalledOnce()
  })

  it('flushes nothing when nothing is queued', () => {
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    queue.flush()
    queue('?a=1')
    vi.advanceTimersByTime(400)
    queue.flush()
    expect(write).toHaveBeenCalledOnce()
  })

  it('cancel drops the queued write, so a reverted edit never lands', () => {
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    queue('?a=passing-through')
    queue.cancel()
    vi.advanceTimersByTime(400)
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps working after a cancel', () => {
    const write = vi.fn()
    const queue = debounceUrlWrite(write, 400)
    queue('?a=1')
    queue.cancel()
    queue('?a=2')
    vi.advanceTimersByTime(400)
    expect(write).toHaveBeenCalledExactlyOnceWith('?a=2')
  })

  it('is the only thing in App that writes history', () => {
    // The bug this guards: a replaceState call inside the sync effect's
    // cleanup fires on every dependency change, not just unmount, so it
    // writes once per keystroke and the debounce collapses nothing. One call
    // site, handed to debounceUrlWrite, is what keeps that from returning.
    // Matched on the qualified call, not the bare word: the surrounding
    // comments name replaceState several times explaining why it is debounced.
    expect(appSource.match(/window\.history\.replaceState\(/g)).toHaveLength(1)
    expect(appSource).toMatch(/debounceUrlWrite\(\(url\) => window\.history\.replaceState/)
  })
})
