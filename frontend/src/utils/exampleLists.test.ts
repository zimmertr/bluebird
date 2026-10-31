import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMPLE_LISTS, fetchExampleList, withList } from './exampleLists'
import { parseCustomCsv } from './customDestinations'
import { fakeResponse } from '../testSupport/fixtures'
import bulgers from '../csv-examples/washington-bulger-list.csv?raw'
import rainier from '../csv-examples/mountaineers-100-peaks-at-mount-rainier-np.csv?raw'
import smoot from '../csv-examples/smoots-climbing-washingtons-mountains-100-peaks.csv?raw'
import homeCourt from '../csv-examples/alpine-lakes-home-court-top-100.csv?raw'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('EXAMPLE_LISTS', () => {
  // The note offers every list the app ships, and each loads whole.
  it('offers four lists of 100 places each', () => {
    expect(EXAMPLE_LISTS.map((l) => l.name)).toEqual([
      'The Bulger List',
      'Mountaineers 100 Peaks at Mount Rainier',
      "Smoot's 100 Peaks",
      'Alpine Lakes Home Court Top 100',
    ])
    for (const csv of [bulgers, rainier, smoot, homeCourt]) expect(parseCustomCsv(csv)).toHaveLength(100)
  })
})

describe('withList', () => {
  it('fills an empty box with the list alone', () => {
    expect(withList('', '1,2,A')).toBe('1,2,A')
    expect(withList('  \n', '1,2,A')).toBe('1,2,A')
  })

  it('adds the list under the rows already there', () => {
    expect(withList('3,4,B', '1,2,A')).toBe('3,4,B\n1,2,A')
    expect(withList('3,4,B\n\n', '1,2,A')).toBe('3,4,B\n1,2,A')
  })
})

describe('fetchExampleList', () => {
  it('answers the file as text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: '46.85,-121.76,Mount Rainier' })))
    expect(await fetchExampleList(EXAMPLE_LISTS[0])).toBe('46.85,-121.76,Mount Rainier')
  })

  // A stale tab asks for an old build's hashed name and gets a 404; the box
  // stays as it was rather than filling with the error page.
  it('answers null for a refusal or a dropped connection, and never rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: 'Not Found' }, 404)))
    expect(await fetchExampleList(EXAMPLE_LISTS[0])).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await fetchExampleList(EXAMPLE_LISTS[0])).toBeNull()
  })
})
