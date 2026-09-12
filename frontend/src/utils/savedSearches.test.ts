import { describe, it, expect } from 'vitest'
import {
  SAVED_SEARCHES_KEY,
  SearchStorage,
  deleteSearch,
  listSaved,
  loadSearch,
  renameSearch,
  saveSearch,
} from './savedSearches'
import { ShareableState, decodeState, encodeState, resolveState } from './urlState'
import { ForecastSelection } from './calendar'
import { GeoPolygon } from '../types'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { NO_CONSTRAINTS } from './clientAnalyze'

// Vitest runs node-env here, so there is no localStorage to reach for: the
// module takes its store as a parameter precisely so a Map can stand in.
// `fail` is how a full store is reproduced — setItem throwing is the whole of
// what a quota looks like from this side.
function fakeStorage(initial?: string, fail = false): SearchStorage & { raw: () => string | null } {
  const cells = new Map<string, string>()
  if (initial !== undefined) cells.set(SAVED_SEARCHES_KEY, initial)
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new DOMException('exceeded', 'QuotaExceededError')
      cells.set(key, value)
    },
    raw: () => cells.get(SAVED_SEARCHES_KEY) ?? null,
  }
}

const polygon: GeoPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-121.76041, 46.85289],
      [-121.49094, 46.20241],
      [-121.11391, 48.11223],
      [-121.76041, 46.85289],
    ],
  ],
}

const DAYS: ForecastSelection = {
  kind: 'days',
  startDate: '2026-07-04',
  endDate: '2026-07-07',
}

const DEFAULT_MODEL = 'gfs_seamless'
const DEPLOYMENT = { maxLimit: 500, defaultForecastModel: DEFAULT_MODEL }

// One state carrying every kind of input a save has to survive: a ring, a
// pasted list, a chosen model that is NOT the deployment default, and a day
// range rather than the current hour.
const state: ShareableState = {
  polygon,
  destinationTypes: ['peak', 'lake'],
  includeUnnamedPeaks: true,
  selection: DAYS,
  forecastModel: 'ecmwf_ifs025',
  sortBy: 'wind_avg_mph',
  sortDesc: true,
  rowKeys: { ...DEFAULT_FAMILY_KEY, wind: 'wind_avg_mph' },
  minElevationFt: 4000,
  maxElevationFt: null,
  constraints: { ...NO_CONSTRAINTS, maxPrecipTotalIn: 0.25 },
  limit: 50,
  customCsv: '46.8529,-121.7604,Mount Rainier\n46.2024,-121.4909',
  showWildfires: true,
  showRadar: false,
  showSmoke: false,
  showGrid: true,
  gridStyle: 'smooth',
  gridReachFrac: 0.75,
  pins: [],
}

function saved(storage: SearchStorage, name = 'Rainier weekend') {
  return saveSearch(storage, name, state, DEFAULT_MODEL)
}

describe('saved searches', () => {
  it('round-trips a search through storage', () => {
    const storage = fakeStorage()
    const outcome = saved(storage)

    expect(outcome.ok).toBe(true)
    expect(listSaved(storage).map((s) => s.name)).toEqual(['Rainier weekend'])
    expect(loadSearch(storage, 'Rainier weekend')).toEqual(decodeState(encodeState(state, DEFAULT_MODEL)))
  })

  // The point of the whole module: a save is a named URL, so what comes back
  // out of one is the same set of inputs the address bar would have restored.
  it('loads the state the URL serialization produced', () => {
    const storage = fakeStorage()
    saved(storage)

    const loaded = resolveState(loadSearch(storage, 'Rainier weekend'), DEPLOYMENT)

    expect(loaded.polygon).toEqual(polygon)
    expect(loaded.destinationTypes).toEqual(['peak', 'lake'])
    expect(loaded.includeUnnamedPeaks).toBe(true)
    expect(loaded.selection).toEqual(DAYS)
    expect(loaded.forecastModel).toBe('ecmwf_ifs025')
    expect(loaded.sortBy).toBe('wind_avg_mph')
    expect(loaded.sortDesc).toBe(true)
    expect(loaded.minElevationFt).toBe(4000)
    expect(loaded.constraints.maxPrecipTotalIn).toBe(0.25)
    expect(loaded.limit).toBe(50)
    expect(loaded.customCsv).toBe(state.customCsv)
    expect(loaded.showWildfires).toBe(true)
    expect(loaded.gridStyle).toBe('smooth')
    expect(loaded.gridReachFrac).toBe(0.75)
  })

  // The stored query is the URL's, not a second encoding of the same fields.
  it('stores the query string the address bar carries', () => {
    const storage = fakeStorage()
    saved(storage)

    expect(listSaved(storage)[0].query).toBe(encodeState(state, DEFAULT_MODEL))
  })

  // A pristine panel encodes to nothing at all, which is a state to restore
  // rather than a missing entry — the difference `null` has to keep.
  it('separates a pristine save from one that does not exist', () => {
    const storage = fakeStorage()
    const pristine = resolveState(null, DEPLOYMENT)
    saveSearch(storage, 'Fresh', pristine, DEFAULT_MODEL)

    expect(listSaved(storage)[0].query).toBe('')
    expect(loadSearch(storage, 'Fresh')).toEqual({})
    expect(loadSearch(storage, 'Nothing here')).toBeNull()
  })

  it('replaces a save of the same name rather than keeping two', () => {
    const storage = fakeStorage()
    saved(storage)
    saveSearch(storage, 'Rainier weekend', { ...state, limit: 7 }, DEFAULT_MODEL)

    const all = listSaved(storage)
    expect(all).toHaveLength(1)
    expect(resolveState(loadSearch(storage, 'Rainier weekend'), DEPLOYMENT).limit).toBe(7)
  })

  it('trims a name and refuses an empty one', () => {
    const storage = fakeStorage()
    saveSearch(storage, '  Enchantments  ', state, DEFAULT_MODEL)

    expect(listSaved(storage).map((s) => s.name)).toEqual(['Enchantments'])
    expect(saveSearch(storage, '   ', state, DEFAULT_MODEL)).toEqual({ ok: false, reason: 'name' })
    expect(renameSearch(storage, 'Enchantments', ' ')).toEqual({ ok: false, reason: 'name' })
    expect(listSaved(storage)).toHaveLength(1)
  })

  it('orders the list by name so the dropdown does not reshuffle', () => {
    const storage = fakeStorage()
    saveSearch(storage, 'Stuart', state, DEFAULT_MODEL)
    saveSearch(storage, 'Adams', state, DEFAULT_MODEL)
    saveSearch(storage, 'Baker', state, DEFAULT_MODEL)

    expect(listSaved(storage).map((s) => s.name)).toEqual(['Adams', 'Baker', 'Stuart'])
  })

  it('renames a save, keeping what it holds', () => {
    const storage = fakeStorage()
    saved(storage)
    const outcome = renameSearch(storage, 'Rainier weekend', 'Rainier in July')

    expect(outcome.ok).toBe(true)
    expect(listSaved(storage).map((s) => s.name)).toEqual(['Rainier in July'])
    expect(resolveState(loadSearch(storage, 'Rainier in July'), DEPLOYMENT).limit).toBe(50)
    expect(loadSearch(storage, 'Rainier weekend')).toBeNull()
  })

  // A rename onto an occupied name replaces its occupant, the same way a save
  // does: one name is one save.
  it('replaces the occupant when a rename collides', () => {
    const storage = fakeStorage()
    saveSearch(storage, 'Keep', { ...state, limit: 11 }, DEFAULT_MODEL)
    saveSearch(storage, 'Drop', { ...state, limit: 22 }, DEFAULT_MODEL)

    expect(renameSearch(storage, 'Keep', 'Drop').ok).toBe(true)
    expect(listSaved(storage).map((s) => s.name)).toEqual(['Drop'])
    expect(resolveState(loadSearch(storage, 'Drop'), DEPLOYMENT).limit).toBe(11)
  })

  it('renaming something that is gone changes nothing', () => {
    const storage = fakeStorage()
    saved(storage)

    expect(renameSearch(storage, 'Absent', 'Anything').ok).toBe(true)
    expect(listSaved(storage).map((s) => s.name)).toEqual(['Rainier weekend'])
  })

  it('deletes one save and leaves the rest', () => {
    const storage = fakeStorage()
    saveSearch(storage, 'Adams', state, DEFAULT_MODEL)
    saveSearch(storage, 'Baker', state, DEFAULT_MODEL)

    expect(deleteSearch(storage, 'Adams').ok).toBe(true)
    expect(listSaved(storage).map((s) => s.name)).toEqual(['Baker'])
    expect(deleteSearch(storage, 'Adams').ok).toBe(true)
  })

  // Corruption is the normal state of anything a hand or an older release can
  // reach. None of it may throw: the panel calls these from event handlers.
  it('reads a corrupt blob as an empty list', () => {
    expect(listSaved(fakeStorage('{{{not json'))).toEqual([])
    expect(listSaved(fakeStorage('"a string"'))).toEqual([])
    expect(listSaved(fakeStorage('{"searches":[]}'))).toEqual([])
    expect(listSaved(fakeStorage(''))).toEqual([])
  })

  it('skips a corrupt entry and keeps the good ones', () => {
    const storage = fakeStorage(
      JSON.stringify([
        { name: 'Good', query: 'sort=precip_total_in', savedAt: '2026-09-01T00:00:00.000Z' },
        { name: '', query: 'sort=precip_total_in' },
        { name: 'No query' },
        { name: 'Wrong type', query: 42 },
        null,
        'not an entry',
        { name: 'Dateless', query: '' },
      ]),
    )

    expect(listSaved(storage).map((s) => s.name)).toEqual(['Dateless', 'Good'])
    expect(listSaved(storage)[0].savedAt).toBe('')
  })

  // A store that will not take a write is reported, never thrown: the caller
  // is a click handler, and an exception there is a blank panel.
  it('reports a refused write instead of throwing', () => {
    const full = fakeStorage(undefined, true)

    expect(saveSearch(full, 'Anywhere', state, DEFAULT_MODEL)).toEqual({
      ok: false,
      reason: 'quota',
    })
    expect(full.raw()).toBeNull()

    const held = fakeStorage(
      JSON.stringify([{ name: 'Held', query: '', savedAt: '' }]),
      true,
    )
    expect(deleteSearch(held, 'Held')).toEqual({ ok: false, reason: 'quota' })
    expect(renameSearch(held, 'Held', 'Other')).toEqual({ ok: false, reason: 'quota' })
    expect(listSaved(held).map((s) => s.name)).toEqual(['Held'])
  })

  // A store that refuses to be read at all — a browser with storage disabled —
  // is an empty list, not a crash on the first render.
  it('reads an unreadable store as empty', () => {
    const blocked: SearchStorage = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
      setItem: () => undefined,
    }

    expect(listSaved(blocked)).toEqual([])
    expect(loadSearch(blocked, 'Anything')).toBeNull()
  })
})
