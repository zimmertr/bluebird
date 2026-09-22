// The reading posture this browser remembers: which panels the results area
// opens with, which columns the table carries, in which order, and whether the
// welcome modal has been seen.
//
// One module rather than the six inline reads App.tsx used to carry, because
// every one of them re-parsed the same stored object behind its own try/catch
// and only one of them ran the column migration below — so a preference read
// somewhere new inherited neither. Split into a read and a write the way
// `urlState.ts` splits the URL, and kept apart from it on purpose: a link is
// the session someone shares, and these are the habits of one browser that no
// link should carry.
//
// Every accessor is total. A storage that refuses to answer — private mode,
// a full quota, a render with no `window` at all — yields the defaults rather
// than throwing into a component's initializer.
import { FAMILY_KEYS } from '../metrics'
import { WILDFIRE_KEY } from './tableColumns'

const VIEW_KEY = 'bluebird_forecast_view'
const WELCOME_KEY = 'bluebird_forecast_welcomed'

/** Which views the results area shows: chart-only, table-only, or both. */
export type ResultsMode = 'chart' | 'table' | 'both'

/**
 * The stored object as older builds wrote it. Typed rather than `any` for the
 * reader's sake only — nothing here is trusted, and every accessor below
 * re-checks the value it takes.
 *
 * `columns` through `columns3` are the retired generations of the column set. The
 * `mode` field older builds wrote beside `modeChosen` is absent here because
 * nothing reads it (see `readViewPrefs`); it is left in storage rather than
 * deleted, since tidying up after a build nobody runs is not this module's job.
 */
interface StoredView {
  modeChosen?: string
  columns?: string[]
  columns2?: string[]
  columns3?: string[]
  columns4?: string[]
  modelColumn?: boolean
  columnOrder?: string[]
}

export interface ViewPrefs {
  /** The mode an explicit press chose, or null while nobody has pressed. */
  modeChosen: ResultsMode | null
  /** The chosen column set, already migrated, or null for the default narrowed one. */
  columns: Set<string> | null
  /** The Model column's own answer, or null to follow the report's model count. */
  modelColumn: boolean | null
  /** The order columns were dragged into, or null for the automatic one. */
  columnOrder: readonly string[] | null
}

function readStored(): StoredView {
  if (typeof localStorage === 'undefined') return {}
  try {
    return (JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') ?? {}) as StoredView
  } catch {
    return {}
  }
}

function isMode(value: unknown): value is ResultsMode {
  return value === 'chart' || value === 'table' || value === 'both'
}

/**
 * One key per generation of the column set, because a stored set cannot
 * otherwise be told apart from a deliberate choice to hide the newest column:
 * `columns` predates the wildfire column joining the picker (#288),
 * `columns2` predates the freezing level (#295) and `columns3` predates snow
 * depth (#449), so reading any of them verbatim would hide a new column from
 * everyone who has ever touched the picker. Each migrates with the newer keys
 * added, which is what those users were already seeing.
 */
function storedColumns(stored: StoredView): Set<string> | null {
  try {
    if (stored.columns4) return new Set(stored.columns4)
    if (stored.columns3) return new Set<string>([...stored.columns3, ...FAMILY_KEYS.snow])
    if (stored.columns2)
      return new Set<string>([...stored.columns2, ...FAMILY_KEYS.freeze, ...FAMILY_KEYS.snow])
    if (stored.columns)
      return new Set<string>([
        ...stored.columns,
        WILDFIRE_KEY,
        ...FAMILY_KEYS.freeze,
        ...FAMILY_KEYS.snow,
      ])
  } catch {
    // A value no older build could have written. The default set is a better
    // answer than no table.
  }
  return null
}

/**
 * Every stored preference, in one parse. Call it once per mount and read the
 * fields off the result: a second call is a second parse of the same string.
 */
export function readViewPrefs(): ViewPrefs {
  const stored = readStored()
  return {
    // The `mode` field older builds wrote is deliberately ignored: it stored
    // every mode change, including the automatic desktop widening, so nothing
    // in it says whether the reader ever actually chose.
    modeChosen: isMode(stored.modeChosen) ? stored.modeChosen : null,
    columns: storedColumns(stored),
    modelColumn: typeof stored.modelColumn === 'boolean' ? stored.modelColumn : null,
    columnOrder: Array.isArray(stored.columnOrder) ? stored.columnOrder : null,
  }
}

/**
 * Merge a preference into the stored object, leaving the rest of it alone.
 *
 * A merge rather than a replace because the preferences are written from
 * different places at different times — the segment on a press, the columns
 * from an effect — and a writer that replaced would drop whatever it did not
 * happen to know about. A field given `null` is dropped from storage rather
 * than stored as null, so "no answer yet" survives a reload as the absence it
 * is.
 */
export function writeViewPrefs(patch: Partial<ViewPrefs>): void {
  if (typeof localStorage === 'undefined') return
  try {
    const stored = readStored()
    if ('modeChosen' in patch) stored.modeChosen = patch.modeChosen ?? undefined
    if ('modelColumn' in patch) stored.modelColumn = patch.modelColumn ?? undefined
    if ('columnOrder' in patch) {
      stored.columnOrder = patch.columnOrder ? [...patch.columnOrder] : undefined
    }
    if ('columns' in patch) {
      // The retired generations go with the write that supersedes them: the
      // chosen set is now spelled in the current key, so an older one left
      // behind is a stale answer waiting for the day the current key is not
      // there to outrank it. The `mode` field above is not in this class — it
      // is ignored on read rather than superseded, so the write leaves it be.
      delete stored.columns
      delete stored.columns2
      delete stored.columns3
      stored.columns4 = patch.columns ? [...patch.columns] : undefined
    }
    localStorage.setItem(VIEW_KEY, JSON.stringify(stored))
  } catch {
    // A storage that refuses the write loses the preference, never the render.
  }
}

/** Whether this browser has already dismissed the welcome modal. */
export function hasWelcomed(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return Boolean(localStorage.getItem(WELCOME_KEY))
  } catch {
    return false
  }
}

/** Record the dismissal, so the modal opens once per browser rather than per visit. */
export function setWelcomed(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    // As above: a storage that refuses only costs the reader a second welcome.
  }
}
