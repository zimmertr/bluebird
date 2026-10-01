import { describe, expect, it } from 'vitest'
import { BASEMAP_FAILED_NOTE, isStyleFailure } from './basemapFailure'

describe('isStyleFailure', () => {
  it('is an error before the style ever loaded that names no source', () => {
    expect(isStyleFailure({}, false)).toBe(true)
  })

  it('is not a source or tile error, nor anything after the style loaded', () => {
    expect(isStyleFailure({ sourceId: 'openmaptiles' }, false)).toBe(false)
    expect(isStyleFailure({}, true)).toBe(false)
    expect(isStyleFailure({ sourceId: 'wildfires' }, true)).toBe(false)
  })
})

it('says the approved sentence', () => {
  expect(BASEMAP_FAILED_NOTE).toBe('The map could not load. Try again later.')
})
