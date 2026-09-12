// Named copies of the analysis inputs, kept in the browser (#124).
//
// A save IS a named URL: the stored `query` is exactly the string `urlState`
// puts in the address bar, so there is one serialization of the inputs and
// this module never re-encodes a field. Loading a save is therefore the same
// act as opening its link, which is what lets it apply form state and nothing
// else — no analysis, no fetch, no change to the report on screen.
//
// Storage is a parameter rather than a global so the whole module is pure
// enough to test under the node-env Vitest, which has no DOM.
import { ShareableState, decodeState, encodeState } from './urlState'

// One JSON blob per concern under a `bluebird_forecast_*` key, the convention
// `bluebird_forecast_view` and `bluebird_forecast_welcomed` already set.
export const SAVED_SEARCHES_KEY = 'bluebird_forecast_searches'

export interface SavedSearch {
  name: string
  // The serialized ShareableState, "?"-less. An empty string is legal and
  // means a pristine panel: `encodeState` writes nothing when no input has
  // moved off its default, and reopening that is a panel at its defaults.
  query: string
  // When the entry was written. Stored rather than shown: it is what tells two
  // copies of one name apart in a backup or an export, and no line of the panel
  // is approved to display a date.
  savedAt: string
}

// Only the two methods this module calls, so a test can pass a fake Map and a
// caller can pass `localStorage`.
export type SearchStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * What a write did. A failure is a value rather than an exception because the
 * caller is a React event handler: a throw there is an unhandled rejection and
 * a blank panel, where a reason can be shown.
 *
 * `quota` covers every refusal to write, not only a full store — a private
 * window that disallows storage refuses the same way, and from the panel's side
 * the fact is identical: the save did not persist.
 */
export type SaveOutcome =
  | { ok: true; searches: SavedSearch[] }
  | { ok: false; reason: 'quota' | 'name' }

// A stored entry is whatever a previous version of this app, another tab, or a
// hand edit left behind, so each one is checked rather than trusted. A bad
// entry is skipped and its neighbours survive: losing one save is recoverable,
// losing the list is not.
function isEntry(value: unknown): value is SavedSearch {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return typeof e.name === 'string' && e.name.trim() !== '' && typeof e.query === 'string'
}

// Alphabetical rather than by age: the select is something you scan for a name
// you already have in mind, and a list that reorders itself every time you save
// moves the entry you were about to pick.
function order(searches: SavedSearch[]): SavedSearch[] {
  return [...searches].sort((a, b) => a.name.localeCompare(b.name))
}

/** Every saved search, ordered for display. Corrupt storage reads as empty. */
export function listSaved(storage: SearchStorage): SavedSearch[] {
  let raw: string | null
  try {
    raw = storage.getItem(SAVED_SEARCHES_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return order(
      parsed.filter(isEntry).map((e) => ({
        name: e.name.trim(),
        query: e.query,
        savedAt: typeof e.savedAt === 'string' ? e.savedAt : '',
      })),
    )
  } catch {
    return []
  }
}

function write(storage: SearchStorage, searches: SavedSearch[]): SaveOutcome {
  try {
    storage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches))
  } catch {
    return { ok: false, reason: 'quota' }
  }
  return { ok: true, searches }
}

/**
 * Store the current inputs under `name`, replacing any entry already holding
 * it. Replacing rather than refusing is what "save" means everywhere else: the
 * name is the address, and a second save to the same address is an update.
 *
 * The name is trimmed, and an empty one is refused — a nameless entry could
 * never be picked out of the list again.
 */
export function saveSearch(
  storage: SearchStorage,
  name: string,
  state: ShareableState,
  defaultForecastModel: string,
): SaveOutcome {
  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'name' }
  const entry: SavedSearch = {
    name: trimmed,
    query: encodeState(state, defaultForecastModel),
    savedAt: new Date().toISOString(),
  }
  const rest = listSaved(storage).filter((s) => s.name !== trimmed)
  return write(storage, order([...rest, entry]))
}

/**
 * Move a save to another name. A collision replaces the entry already holding
 * the new name, for the same reason `saveSearch` does: one name is one save,
 * and the alternative is a refusal the panel has no approved sentence for.
 */
export function renameSearch(storage: SearchStorage, from: string, to: string): SaveOutcome {
  const trimmed = to.trim()
  if (trimmed === '') return { ok: false, reason: 'name' }
  const searches = listSaved(storage)
  const entry = searches.find((s) => s.name === from)
  if (!entry) return { ok: true, searches }
  const rest = searches.filter((s) => s.name !== from && s.name !== trimmed)
  return write(storage, order([...rest, { ...entry, name: trimmed }]))
}

/** Drop a save. Removing one that is already gone is not an error. */
export function deleteSearch(storage: SearchStorage, name: string): SaveOutcome {
  const searches = listSaved(storage)
  const rest = searches.filter((s) => s.name !== name)
  if (rest.length === searches.length) return { ok: true, searches }
  return write(storage, rest)
}

/**
 * The inputs a save carries, in the shape the URL restore path already takes.
 *
 * `null` means there is no save under that name. A save whose query is empty —
 * a pristine panel — comes back as `{}` rather than as `null`, because "every
 * input is at its default" is a state to apply, not a missing entry.
 */
export function loadSearch(
  storage: SearchStorage,
  name: string,
): Partial<ShareableState> | null {
  const entry = listSaved(storage).find((s) => s.name === name)
  if (!entry) return null
  return decodeState(entry.query) ?? {}
}
