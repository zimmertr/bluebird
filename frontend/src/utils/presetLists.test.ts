import { afterEach, describe, expect, it, vi } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import { PRESET_LISTS, PRESET_REGIONS, presetListById, presetListIn, fetchPresetList, forgetPresetLists } from './presetLists'
import { parseCustomCsv } from './customDestinations'
import { MAX_ANALYZE_DESTINATIONS } from './clientAnalyze'
import { fakeResponse } from '../testSupport/fixtures'
import manifest from '../coordinate-lists/lists.json'
import schema from '../coordinate-lists/lists.schema.json'

// Every list the directory holds, read as the reader's box would hold it. A
// glob rather than one import per file, so a list the crawl adds is checked
// by the same rules without an edit here.
const csvs = import.meta.glob('../coordinate-lists/*.csv', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>
// Every file the directory holds, whatever its ending, globbed apart from the
// module's own glob so the manifest is checked against the directory rather
// than against itself.
const everyFile = import.meta.glob('../coordinate-lists/*', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const rowsOf = (csv: string): string[] => csv.split('\n').filter((line: string) => line.trim() !== '')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetPresetLists()
})

describe('the manifest', () => {
  // The schema is what the crawl skill and an editor read, so the manifest
  // the app ships has to be one it accepts.
  it('holds to its schema', () => {
    const validate = new Ajv2020({ allErrors: true }).compile(schema)
    validate(manifest)
    expect(validate.errors ?? []).toEqual([])
  })

  // A share link names a list by its id (#864), so two lists cannot share one.
  it('gives every list an id of its own, and a name of its own', () => {
    const ids = manifest.lists.map((list) => list.id)
    expect(new Set(ids).size).toBe(ids.length)
    const names = manifest.lists.map((list) => list.name)
    expect(new Set(names).size).toBe(names.length)
  })

  // The directory holds the manifest, its schema and one CSV per entry, named
  // by the entry's id, and nothing else: a CSV with no entry would ship and
  // never be offered, and an entry with no CSV would be offered and never load.
  it('names exactly the CSVs the directory holds, each by its id', () => {
    const files = Object.keys(everyFile).map(baseName).sort()
    const expected = ['lists.json', 'lists.schema.json', ...manifest.lists.map((list) => `${list.id}.csv`)].sort()
    expect(files).toEqual(expected)
    for (const list of manifest.lists) expect(list.file, list.id).toBe(`${list.id}.csv`)
  })

  // The crawl writes each count and the menu shows it, so it is recomputed
  // here: a row added or dropped by hand fails until the count follows.
  it("states each list's row count", () => {
    for (const list of manifest.lists) {
      const csv = csvs[`../coordinate-lists/${list.file}`]
      expect(rowsOf(csv), list.id).toHaveLength(list.peaks)
    }
  })

  // No list carries more rows than one analysis takes, or a pick would fill
  // the box with a list Analyze refuses.
  it('holds no list longer than one analysis takes', () => {
    for (const list of manifest.lists) expect(list.peaks, list.id).toBeLessThanOrEqual(MAX_ANALYZE_DESTINATIONS)
  })

  it('files every list under a region it names, each heading once', () => {
    const regions = manifest.regions.map((region) => region.name)
    expect(new Set(regions).size).toBe(regions.length)
    for (const list of manifest.lists) expect(regions, list.id).toContain(list.region)
  })

  // The headings are user-facing strings, approved as a set on 2026-11-05
  // (#848). A new one is the maintainer's to approve, and then joins this list.
  it('carries the approved region headings, in the approved order', () => {
    expect(manifest.regions.map((region) => region.name)).toEqual([
      'Nationwide',
      'Washington',
      'Oregon and the Cascades',
      'Northern Rockies',
      'Alaska',
      'California',
      'Colorado',
      'Southwest',
      'Northeast',
      'Southeast',
    ])
  })
})

describe('PRESET_LISTS', () => {
  it('offers every list the manifest names, in its order, each with the URL of its file', () => {
    expect(PRESET_LISTS.map((list) => list.id)).toEqual(manifest.lists.map((list) => list.id))
    for (const list of PRESET_LISTS) expect(list.url, list.id).toEqual(expect.any(String))
    expect(new Set(PRESET_LISTS.map((list) => list.url)).size).toBe(PRESET_LISTS.length)
  })

  it('offers every region the manifest names, with the places a search also matches', () => {
    expect(PRESET_REGIONS.map((region) => region.name)).toEqual(manifest.regions.map((region) => region.name))
    expect(PRESET_REGIONS.find((region) => region.name === 'Northern Rockies')?.places).toEqual([
      'Idaho',
      'Montana',
      'Wyoming',
    ])
    expect(PRESET_REGIONS.find((region) => region.name === 'Washington')?.places).toEqual([])
  })

  // The name lives in the manifest, so a file carries rows and nothing else.
  it('carries no comment line in any list', () => {
    for (const [path, csv] of Object.entries(csvs)) {
      expect(csv.split('\n').filter((line: string) => line.startsWith('#')), path).toEqual([])
    }
  })

  // Every row a list carries reaches the box as a place: a row the parser
  // skipped would be a peak the list promises and the analysis never sees.
  it('parses every row of every list to a place', () => {
    for (const [path, csv] of Object.entries(csvs)) {
      const rows = rowsOf(csv)
      expect(rows.length, path).toBeGreaterThan(0)
      expect(parseCustomCsv(csv), path).toHaveLength(rows.length)
    }
  })
})

// A share link names a list by its id (`list=`, #864).
describe('presetListById', () => {
  it('finds each list by its id, and nothing for an id the build does not ship', () => {
    for (const list of PRESET_LISTS) expect(presetListById(list.id)).toBe(list)
    expect(presetListById('no-such-list')).toBeUndefined()
    expect(presetListById('')).toBeUndefined()
  })
})

describe('presetListIn', () => {
  // The field reads the list's name only once that list has arrived and the
  // box is that list; rows a share link spelled out are not one until then.
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
