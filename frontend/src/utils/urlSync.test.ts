import { describe, it, expect } from 'vitest'
import { urlNeedsSync } from './urlSync'

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
