import { readdirSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMPLE_LISTS, exampleListIn, fetchExampleList, forgetExampleLists } from './exampleLists'
import { parseCustomCsv } from './customDestinations'
import { fakeResponse } from '../testSupport/fixtures'

// Every list the directory holds, read as the reader's box would hold it. A
// glob rather than one import per file, so a fifth list dropped in is checked
// by the same rules without an edit here.
const csvs = import.meta.glob('../coordinate-lists/*.csv', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>
const files = readdirSync(new URL('../coordinate-lists/', import.meta.url)).filter((f) => f.endsWith('.csv'))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetExampleLists()
})

describe('EXAMPLE_LISTS', () => {
  // The directory is the list (record 0263): the menu offers every file in
  // it, by its name, alphabetically.
  it('offers every file in the directory by its name, alphabetically', () => {
    const names = files.map((f) => f.slice(0, -'.csv'.length)).sort((a, b) => a.localeCompare(b))
    expect(names.length).toBeGreaterThan(0)
    expect(EXAMPLE_LISTS.map((l) => l.name)).toEqual(names)
    expect(Object.keys(csvs)).toHaveLength(files.length)
  })

  // The name lives in the file name, so a file carries rows and nothing else.
  it('carries no comment line in any list', () => {
    for (const [path, csv] of Object.entries(csvs)) {
      expect(csv.split('\n').filter((line) => line.startsWith('#')), path).toEqual([])
    }
  })

  // Every row a list carries reaches the box as a place: a row the parser
  // skipped would be a peak the list promises and the analysis never sees.
  it('parses every row of every list to a place', () => {
    for (const [path, csv] of Object.entries(csvs)) {
      const rows = csv.split('\n').filter((line) => line.trim() !== '')
      expect(rows.length, path).toBeGreaterThan(0)
      expect(parseCustomCsv(csv), path).toHaveLength(rows.length)
    }
  })
})

describe('exampleListIn', () => {
  // The field reads the list's name only once that list has arrived and the
  // box is that list; a share link's restored rows read as Custom until then.
  it('names the list the box holds once it has arrived, a trailing newline aside', async () => {
    const list = EXAMPLE_LISTS[0]
    expect(exampleListIn('46.85,-121.76,Mount Rainier')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: '46.85,-121.76,Mount Rainier' })))
    await fetchExampleList(list)
    expect(exampleListIn('46.85,-121.76,Mount Rainier')).toBe(list)
    expect(exampleListIn('46.85,-121.76,Mount Rainier\n')).toBe(list)
    expect(exampleListIn('46.85,-121.76,Mount Rainier\n1,2,Mine')).toBeNull()
    expect(exampleListIn('')).toBeNull()
  })

  it('serves a list that arrived without asking again', async () => {
    const spy = vi.fn(async () => fakeResponse({ raw: '1,2,A' }))
    vi.stubGlobal('fetch', spy)
    await fetchExampleList(EXAMPLE_LISTS[0])
    await fetchExampleList(EXAMPLE_LISTS[0])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('fetchExampleList', () => {
  // Without the file's ending newline, which in the box would be an empty
  // last line hiding one of the two the box shows.
  it('answers the file as text, less its ending newline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: '46.85,-121.76,Mount Rainier\n' })))
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
