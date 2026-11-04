import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESET_LISTS, presetListIn, fetchPresetList, forgetPresetLists } from './presetLists'
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
// Every file the directory holds, whatever its ending, globbed apart from the
// module's own glob so the menu is checked against the directory rather than
// against itself.
const everyFile = import.meta.glob('../coordinate-lists/*', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetPresetLists()
})

describe('PRESET_LISTS', () => {
  // The directory is the list (record 0263): the menu offers every file in
  // it, by its name, alphabetically.
  it('offers every file in the directory by its name, alphabetically', () => {
    const files = Object.keys(everyFile).map(baseName)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(file.endsWith('.csv'), file).toBe(true)
    const names = files
      .map((file: string) => file.slice(0, -'.csv'.length))
      .sort((a: string, b: string) => a.localeCompare(b))
    expect(PRESET_LISTS.map((l) => l.name)).toEqual(names)
    expect(Object.keys(csvs)).toHaveLength(files.length)
  })

  // The name lives in the file name, so a file carries rows and nothing else.
  it('carries no comment line in any list', () => {
    for (const [path, csv] of Object.entries(csvs)) {
      expect(csv.split('\n').filter((line: string) => line.startsWith('#')), path).toEqual([])
    }
  })

  // Every row a list carries reaches the box as a place: a row the parser
  // skipped would be a peak the list promises and the analysis never sees.
  it('parses every row of every list to a place', () => {
    for (const [path, csv] of Object.entries(csvs)) {
      const rows = csv.split('\n').filter((line: string) => line.trim() !== '')
      expect(rows.length, path).toBeGreaterThan(0)
      expect(parseCustomCsv(csv), path).toHaveLength(rows.length)
    }
  })
})

describe('presetListIn', () => {
  // The field reads the list's name only once that list has arrived and the
  // box is that list; a share link's restored rows are not one until then.
  it('names the list the box holds once it has arrived, a trailing newline aside', async () => {
    const list = PRESET_LISTS[0]
    expect(presetListIn('46.85,-121.76,Mount Rainier')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: '46.85,-121.76,Mount Rainier' })))
    await fetchPresetList(list)
    expect(presetListIn('46.85,-121.76,Mount Rainier')).toBe(list)
    expect(presetListIn('46.85,-121.76,Mount Rainier\n')).toBe(list)
    expect(presetListIn('46.85,-121.76,Mount Rainier\n1,2,Mine')).toBeNull()
    expect(presetListIn('')).toBeNull()
  })

  it('serves a list that arrived without asking again', async () => {
    const spy = vi.fn(async () => fakeResponse({ raw: '1,2,A' }))
    vi.stubGlobal('fetch', spy)
    await fetchPresetList(PRESET_LISTS[0])
    await fetchPresetList(PRESET_LISTS[0])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('fetchPresetList', () => {
  // Without the file's ending newline, which in the box would be an empty
  // last line hiding one of the two the box shows.
  it('answers the file as text, less its ending newline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: '46.85,-121.76,Mount Rainier\n' })))
    expect(await fetchPresetList(PRESET_LISTS[0])).toBe('46.85,-121.76,Mount Rainier')
  })

  // A stale tab asks for an old build's hashed name and gets a 404; the box
  // stays as it was rather than filling with the error page.
  it('answers null for a refusal or a dropped connection, and never rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ raw: 'Not Found' }, 404)))
    expect(await fetchPresetList(PRESET_LISTS[0])).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await fetchPresetList(PRESET_LISTS[0])).toBeNull()
  })
})
