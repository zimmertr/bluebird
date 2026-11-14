import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAMILY_KEYS } from '../metrics'
import { CLOSURE_KEY, WILDFIRE_KEY } from './tableColumns'
import {
  STARRED_LISTS_KEY,
  THEME_KEY,
  hasWelcomed,
  readStarredLists,
  readTheme,
  readViewPrefs,
  setWelcomed,
  writeStarredLists,
  writeTheme,
  writeViewPrefs,
} from './viewPrefs'

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
      legendOpen: null,
      chartLayout: null,
      showPlayer: null,
      baseOpacity: null,
    })
  })

  // The three habits that left the share link (#864). Each is re-checked on
  // the way out, since the stored object is whatever some build or some hand
  // left there.
  it('returns the chart layout, the player switch and the opacity levels a reader left', () => {
    withStored({ chartLayout: '2x2', showPlayer: false, baseOpacity: { satellite: 80, topo: 30, relief: 100, slope: 0 } })
    const prefs = readViewPrefs()
    expect(prefs.chartLayout).toBe('2x2')
    expect(prefs.showPlayer).toBe(false)
    expect(prefs.baseOpacity).toEqual({ satellite: 80, topo: 30, relief: 100, slope: 0 })
  })

  it('takes a known layout and a boolean player and nothing else', () => {
    withStored({ chartLayout: '3x3', showPlayer: 'yes' })
    expect(readViewPrefs().chartLayout).toBeNull()
    expect(readViewPrefs().showPlayer).toBeNull()
    withStored({ chartLayout: 7, showPlayer: 1 })
    expect(readViewPrefs().chartLayout).toBeNull()
    expect(readViewPrefs().showPlayer).toBeNull()
  })

  it('holds each stored level to a whole percent, and reads a missing one as the default', () => {
    withStored({ baseOpacity: { satellite: 250, topo: -5, relief: 62.4, slope: 'faint', hillshade: 10 } })
    expect(readViewPrefs().baseOpacity).toEqual({ satellite: 100, topo: 0, relief: 62, slope: 50 })
    withStored({ baseOpacity: { slope: 70 } })
    expect(readViewPrefs().baseOpacity).toEqual({ satellite: 50, topo: 50, relief: 50, slope: 70 })
    withStored({ baseOpacity: 'faint' })
    expect(readViewPrefs().baseOpacity).toBeNull()
    withStored({ baseOpacity: null })
    expect(readViewPrefs().baseOpacity).toBeNull()
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
    withStored({ columns9: ['name', 'precip_total_in'] })
    expect([...readViewPrefs().columns!]).toEqual(['name', 'precip_total_in'])
  })

  // `columns8` predates snow depth's return (#849), so a set stored under it
  // comes back with the snow depth column shown and the rest as it was.
  it('shows the snow depth column on a set stored before it returned', () => {
    withStored({ columns8: ['name', 'precip_total_in'] })
    expect([...readViewPrefs().columns!]).toEqual([
      'name',
      'precip_total_in',
      'snow_depth_avg_in',
      'snow_depth_max_in',
      'snow_depth_min_in',
    ])
  })

  // `columns5` predates the Closure column (#550), so every older set comes
  // back with it shown, which is what a reader who never chose sees too.
  it.each([
    ['columns5'],
    ['columns4'],
    ['columns3'],
    ['columns2'],
    ['columns'],
  ])('adds the Closure column to a set stored as %s', (generation) => {
    withStored({ [generation]: ['name'] })
    const columns = readViewPrefs().columns!
    expect(columns.has('name')).toBe(true)
    expect(columns.has(CLOSURE_KEY)).toBe(true)
  })

  it('keeps the Closure column hidden when the current generation hid it', () => {
    withStored({ columns8: ['name', WILDFIRE_KEY] })
    expect(readViewPrefs().columns!.has(CLOSURE_KEY)).toBe(false)
  })

  // `columns6` predates the cloud deck (#670), and every older generation
  // predates it too. A set stored then was a choice about the columns that
  // existed, so the new ones start shown.
  it.each([['columns6'], ['columns5'], ['columns4'], ['columns3'], ['columns2'], ['columns']])(
    'adds the cloud deck columns to a set stored as %s',
    (generation) => {
      withStored({ [generation]: ['name', 'precip_total_in'] })
      const columns = readViewPrefs().columns!
      expect(columns.has('name')).toBe(true)
      expect(columns.has('precip_total_in')).toBe(true)
      for (const key of FAMILY_KEYS.cloud_deck) expect(columns.has(key)).toBe(true)
      expect(columns.has('temp_min_f')).toBe(false)
    },
  )

  it('keeps the Closure column hidden when columns6 hid it', () => {
    withStored({ columns6: ['name', WILDFIRE_KEY] })
    expect(readViewPrefs().columns!.has(CLOSURE_KEY)).toBe(false)
  })

  // `columns7` predates snowfall (#678), and every older generation predates
  // it too.
  it.each([
    ['columns7'],
    ['columns6'],
    ['columns5'],
    ['columns4'],
    ['columns3'],
    ['columns2'],
    ['columns'],
  ])(
    'adds the snowfall columns to a set stored as %s',
    (generation) => {
      withStored({ [generation]: ['name', WILDFIRE_KEY] })
      const columns = readViewPrefs().columns!
      expect(columns.has('name')).toBe(true)
      expect(columns.has(WILDFIRE_KEY)).toBe(true)
      for (const key of FAMILY_KEYS.snowfall) expect(columns.has(key)).toBe(true)
    },
  )

  // `columns2` predates the freezing level (#295).
  it('adds the freezing-level and snowfall columns to a set an older build stored', () => {
    withStored({ columns2: ['name', WILDFIRE_KEY] })
    const columns = readViewPrefs().columns!
    expect(columns.has('name')).toBe(true)
    expect(columns.has(WILDFIRE_KEY)).toBe(true)
    for (const key of FAMILY_KEYS.freeze) expect(columns.has(key)).toBe(true)
    for (const key of FAMILY_KEYS.snowfall) expect(columns.has(key)).toBe(true)
  })

  // `columns` predates the wildfire column joining the picker (#288), so it
  // needs both generations of additions.
  it('adds every newer column to the oldest set', () => {
    withStored({ columns: ['name'] })
    const columns = readViewPrefs().columns!
    expect(columns.has('name')).toBe(true)
    expect(columns.has(WILDFIRE_KEY)).toBe(true)
    for (const key of FAMILY_KEYS.freeze) expect(columns.has(key)).toBe(true)
    for (const key of FAMILY_KEYS.snowfall) expect(columns.has(key)).toBe(true)
    for (const key of FAMILY_KEYS.snow_depth) expect(columns.has(key)).toBe(true)
    for (const key of FAMILY_KEYS.cloud_deck) expect(columns.has(key)).toBe(true)
  })

  it('prefers the newest generation when several are stored', () => {
    withStored({
      columns: ['name'],
      columns2: ['type'],
      columns3: ['latitude'],
      columns4: ['longitude'],
      columns5: ['elevation_ft'],
      columns6: ['osm_id'],
      columns7: ['type'],
      columns8: ['type'],
      columns9: ['name'],
    })
    expect([...readViewPrefs().columns!]).toEqual(['name'])
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

  // A desk's legend card remembers being folded (#696), and a value no build
  // wrote reads as no answer.
  it('keeps whether the legend was left open', () => {
    const storage = withStored({ modeChosen: 'both' })
    writeViewPrefs({ legendOpen: false })
    expect(stored(storage)).toEqual({ modeChosen: 'both', legendOpen: false })
    expect(readViewPrefs().legendOpen).toBe(false)
    withStored({ legendOpen: 'yes' })
    expect(readViewPrefs().legendOpen).toBeNull()
  })

  // #864: the chart's panel layout, the forecast player's switch and the four
  // base-map opacity levels, which a share link used to carry.
  it('stores the chart layout, the player switch and the opacity levels beside the rest', () => {
    const storage = withStored({ modeChosen: 'both' })
    writeViewPrefs({ chartLayout: '1-2-1', showPlayer: true })
    writeViewPrefs({ baseOpacity: { satellite: 80, topo: 50, relief: 50, slope: 0 } })
    expect(stored(storage)).toEqual({
      modeChosen: 'both',
      chartLayout: '1-2-1',
      showPlayer: true,
      baseOpacity: { satellite: 80, topo: 50, relief: 50, slope: 0 },
    })
    // Null is no answer, and is dropped like every other preference's.
    writeViewPrefs({ chartLayout: null, showPlayer: null, baseOpacity: null })
    expect(stored(storage)).toEqual({ modeChosen: 'both' })
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
      columns4: ['elevation_ft'],
      columns5: ['osm_id'],
      columns6: ['name'],
      columns7: ['type'],
      columns8: ['latitude'],
      modeChosen: 'both',
    })
    writeViewPrefs({ columns: new Set(['longitude']) })
    expect(stored(storage)).toEqual({ modeChosen: 'both', columns9: ['longitude'] })
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
      legendOpen: null,
      chartLayout: null,
      showPlayer: null,
      baseOpacity: null,
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
      legendOpen: null,
      chartLayout: null,
      showPlayer: null,
      baseOpacity: null,
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

  // Where site data is blocked, Chrome's getter throws a SecurityError on the
  // read of `localStorage` itself, before any method is reached, and a
  // `typeof` guard reads it too.
  it('yields the defaults where reading the storage itself throws', () => {
    const own = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError')
      },
    })
    try {
      expect(hasWelcomed()).toBe(false)
      expect(readTheme()).toBe('dark')
      expect(readViewPrefs()).toEqual({
        modeChosen: null,
        columns: null,
        modelColumn: null,
        columnOrder: null,
        legendOpen: null,
        chartLayout: null,
        showPlayer: null,
        baseOpacity: null,
      })
      expect(() => writeViewPrefs({ modeChosen: 'both' })).not.toThrow()
      expect(() => setWelcomed()).not.toThrow()
      expect(() => writeTheme('light')).not.toThrow()
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage
      if (own) Object.defineProperty(globalThis, 'localStorage', own)
    }
  })

  it('yields the defaults on a stored value that is not JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [VIEW_KEY]: '{not json' }))
    expect(readViewPrefs().modeChosen).toBeNull()
  })
})

describe('the theme (#706)', () => {
  it('keeps it under a key of its own, beside the view object rather than in it', () => {
    expect(THEME_KEY).toBe('bluebird_forecast_theme')
    expect(THEME_KEY).not.toBe(VIEW_KEY)
  })

  it('reads dark when nothing is stored, whatever the OS prefers', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(readTheme()).toBe('dark')
  })

  it('reads light only when light is what is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [THEME_KEY]: 'light' }))
    expect(readTheme()).toBe('light')
    vi.stubGlobal('localStorage', fakeStorage({ [THEME_KEY]: 'sepia' }))
    expect(readTheme()).toBe('dark')
  })

  it('stores light and forgets the key on dark, leaving the view object alone', () => {
    const storage = withStored({ legendOpen: true })
    writeTheme('light')
    expect(storage.getItem(THEME_KEY)).toBe('light')
    writeTheme('dark')
    expect(storage.getItem(THEME_KEY)).toBeNull()
    expect(stored(storage)).toEqual({ legendOpen: true })
  })

  it('answers dark and does not throw when there is no storage, or it refuses', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readTheme()).toBe('dark')
    expect(() => writeTheme('light')).not.toThrow()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    expect(readTheme()).toBe('dark')
    expect(() => writeTheme('dark')).not.toThrow()
  })
})

describe('the starred coordinate lists (#848)', () => {
  it('keeps them under a key of their own', () => {
    expect(STARRED_LISTS_KEY).toBe('bluebird_forecast_starred_lists')
  })

  it('reads none when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(readStarredLists()).toEqual([])
  })

  it('reads the ids in the order they were starred', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [STARRED_LISTS_KEY]: '["wy-13ers","wa-bulger-list"]' }))
    expect(readStarredLists()).toEqual(['wy-13ers', 'wa-bulger-list'])
  })

  // A value no build wrote: not JSON, not a list, or a list holding something
  // that is no id.
  it('reads none, or only the ids, from a value no build wrote', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [STARRED_LISTS_KEY]: 'not json' }))
    expect(readStarredLists()).toEqual([])
    vi.stubGlobal('localStorage', fakeStorage({ [STARRED_LISTS_KEY]: '{"a":1}' }))
    expect(readStarredLists()).toEqual([])
    vi.stubGlobal('localStorage', fakeStorage({ [STARRED_LISTS_KEY]: '["wa-bulger-list",7,null]' }))
    expect(readStarredLists()).toEqual(['wa-bulger-list'])
  })

  it('stores the ids and forgets the key when none is left, leaving the view object alone', () => {
    const storage = withStored({ legendOpen: true })
    writeStarredLists(['wa-bulger-list', 'wy-13ers'])
    expect(JSON.parse(storage.getItem(STARRED_LISTS_KEY)!)).toEqual(['wa-bulger-list', 'wy-13ers'])
    writeStarredLists([])
    expect(storage.getItem(STARRED_LISTS_KEY)).toBeNull()
    expect(stored(storage)).toEqual({ legendOpen: true })
  })

  it('answers none and does not throw when there is no storage, or it refuses', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readStarredLists()).toEqual([])
    expect(() => writeStarredLists(['wa-bulger-list'])).not.toThrow()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })
    expect(readStarredLists()).toEqual([])
    expect(() => writeStarredLists([])).not.toThrow()
  })
})
