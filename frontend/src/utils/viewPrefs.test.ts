import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAMILY_KEYS } from '../metrics'
import { WILDFIRE_KEY } from './tableColumns'
import { hasWelcomed, readViewPrefs, setWelcomed, writeViewPrefs } from './viewPrefs'

const VIEW_KEY = 'bluebird_forecast_view'
const WELCOME_KEY = 'bluebird_forecast_welcomed'

// A storage that behaves. Vitest runs in node, where there is no localStorage
// at all, so every test that expects one installs it.
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
    data,
  }
}

function withStored(view: unknown) {
  const storage = fakeStorage({ [VIEW_KEY]: JSON.stringify(view) })
  vi.stubGlobal('localStorage', storage)
  return storage
}

function stored(storage: ReturnType<typeof fakeStorage>): Record<string, unknown> {
  return JSON.parse(storage.getItem(VIEW_KEY) ?? '{}')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reading the stored view', () => {
  it('defaults every preference when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(readViewPrefs()).toEqual({
      modeChosen: null,
      columns: null,
      modelColumn: null,
      columnOrder: null,
    })
  })

  it('returns what an explicit press stored', () => {
    withStored({ modeChosen: 'both', modelColumn: false, columnOrder: ['name', 'type'] })
    const prefs = readViewPrefs()
    expect(prefs.modeChosen).toBe('both')
    expect(prefs.modelColumn).toBe(false)
    expect(prefs.columnOrder).toEqual(['name', 'type'])
  })

  // The `mode` field older builds wrote stored every mode change, including the
  // automatic desktop widening, so it cannot say whether the reader ever chose.
  it('ignores the retired `mode` field and any value outside the three', () => {
    withStored({ mode: 'chart' })
    expect(readViewPrefs().modeChosen).toBeNull()
    withStored({ modeChosen: 'map' })
    expect(readViewPrefs().modeChosen).toBeNull()
  })

  it('takes a boolean model column and nothing else', () => {
    withStored({ modelColumn: true })
    expect(readViewPrefs().modelColumn).toBe(true)
    withStored({ modelColumn: 'yes' })
    expect(readViewPrefs().modelColumn).toBeNull()
  })

  it('takes a column order only as a list', () => {
    withStored({ columnOrder: 'name' })
    expect(readViewPrefs().columnOrder).toBeNull()
  })
})

// The whole reason this is one module: the migration used to live in one of the
// six inline reads, so a preference read anywhere else inherited none of it.
describe('the column-set migration', () => {
  it('reads the current generation verbatim', () => {
    withStored({ columns4: ['name', 'precip_total_in'] })
    expect([...readViewPrefs().columns!]).toEqual(['name', 'precip_total_in'])
  })

  // `columns3` predates snow depth (#449).
  it('adds the snow column to a set an older build stored', () => {
    withStored({ columns3: ['name', WILDFIRE_KEY] })
    const columns = readViewPrefs().columns!
    expect(columns.has('name')).toBe(true)
    expect(columns.has(WILDFIRE_KEY)).toBe(true)
    for (const key of FAMILY_KEYS.snow) expect(columns.has(key)).toBe(true)
  })

  // `columns2` predates the freezing level (#295).
  it('adds the freezing-level and snow columns to a set an older build stored', () => {
    withStored({ columns2: ['name', WILDFIRE_KEY] })
    const columns = readViewPrefs().columns!
    expect(columns.has('name')).toBe(true)
    expect(columns.has(WILDFIRE_KEY)).toBe(true)
    for (const key of FAMILY_KEYS.freeze) expect(columns.has(key)).toBe(true)
    for (const key of FAMILY_KEYS.snow) expect(columns.has(key)).toBe(true)
  })

  // `columns` predates the wildfire column joining the picker (#288), so it
  // needs both generations of additions.
  it('adds every newer column to the oldest set', () => {
    withStored({ columns: ['name'] })
    const columns = readViewPrefs().columns!
    expect(columns.has('name')).toBe(true)
    expect(columns.has(WILDFIRE_KEY)).toBe(true)
    for (const key of FAMILY_KEYS.freeze) expect(columns.has(key)).toBe(true)
    for (const key of FAMILY_KEYS.snow) expect(columns.has(key)).toBe(true)
  })

  it('prefers the newest generation when several are stored', () => {
    withStored({
      columns: ['name'],
      columns2: ['type'],
      columns3: ['latitude'],
      columns4: ['longitude'],
    })
    expect([...readViewPrefs().columns!]).toEqual(['longitude'])
  })
})

describe('writing a preference', () => {
  it('merges rather than replaces', () => {
    const storage = withStored({ modeChosen: 'chart', columnOrder: ['name'] })
    writeViewPrefs({ modelColumn: true })
    expect(stored(storage)).toEqual({
      modeChosen: 'chart',
      columnOrder: ['name'],
      modelColumn: true,
    })
  })

  it('drops a null rather than storing one, so the report still decides', () => {
    const storage = withStored({ modelColumn: true, columnOrder: ['name'] })
    writeViewPrefs({ modelColumn: null, columnOrder: null })
    expect(stored(storage)).toEqual({})
    expect(readViewPrefs().modelColumn).toBeNull()
  })

  // Left behind, a retired generation would outlive the set being edited and
  // migrate again on the next read.
  it('retires the older column keys with the write that supersedes them', () => {
    const storage = withStored({
      columns: ['name'],
      columns2: ['type'],
      columns3: ['latitude'],
      modeChosen: 'both',
    })
    writeViewPrefs({ columns: new Set(['longitude']) })
    expect(stored(storage)).toEqual({ modeChosen: 'both', columns4: ['longitude'] })
  })

  it('round-trips a whole table shape', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    writeViewPrefs({
      columns: new Set(['name', 'type']),
      modelColumn: false,
      columnOrder: ['type', 'name'],
    })
    expect(readViewPrefs()).toEqual({
      modeChosen: null,
      columns: new Set(['name', 'type']),
      modelColumn: false,
      columnOrder: ['type', 'name'],
    })
  })
})

describe('the welcome flag', () => {
  it('is false until it is set, and sticks after', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    expect(hasWelcomed()).toBe(false)
    setWelcomed()
    expect(storage.getItem(WELCOME_KEY)).toBe('1')
    expect(hasWelcomed()).toBe(true)
  })
})

// A quota-full storage, a private window, a render with no `window` at all: a
// preference is worth losing, a render is not. This is the guard the welcome
// flag was missing — it read `localStorage` bare, which throws rather than
// returns.
describe('a storage that will not answer', () => {
  const throwing = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('quota')
    },
  }

  it('yields the defaults and swallows the write', () => {
    vi.stubGlobal('localStorage', throwing)
    expect(readViewPrefs()).toEqual({
      modeChosen: null,
      columns: null,
      modelColumn: null,
      columnOrder: null,
    })
    expect(hasWelcomed()).toBe(false)
    expect(() => writeViewPrefs({ modeChosen: 'both' })).not.toThrow()
    expect(() => setWelcomed()).not.toThrow()
  })

  it('yields the defaults where there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readViewPrefs().columns).toBeNull()
    expect(hasWelcomed()).toBe(false)
    expect(() => writeViewPrefs({ modeChosen: 'both' })).not.toThrow()
    expect(() => setWelcomed()).not.toThrow()
  })

  it('yields the defaults on a stored value that is not JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [VIEW_KEY]: '{not json' }))
    expect(readViewPrefs().modeChosen).toBeNull()
  })
})
