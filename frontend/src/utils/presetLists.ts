import { apiFetch } from './apiFetch'
import manifest from '../coordinate-lists/lists.json'

// The ready-made lists the Coordinate list field under Coordinate search puts in
// the box (#838, #848). `src/coordinate-lists/lists.json` is the list of them:
// one entry per list with the name and description the menu reads, the region
// it stands under, its peak count and where its rows came from, and the
// regions themselves in the menu's order. Every name, description and heading
// there is a user-facing string the maintainer approves before it lands.
//
// The manifest replaced a directory read by file name, where a file's name
// was the menu's string. A file name cannot carry a region, a count or a
// source, and it cannot go in a share link, which a list's `id` can: an id is
// a slug that never changes once shipped. Each CSV is named by that id and
// holds rows only. `presetLists.test.ts` holds the manifest to its schema and
// to the directory: every CSV has one entry, every entry one CSV, and each
// `peaks` is its file's row count.
//
// Each list is a hashed asset fetched on the pick that asks for it. A fetch
// rather than a lazy `import()` for `usStatesLoad.ts`'s reason: a stale tab's
// failed import reloads the page (`staleChunk.ts`), and a list is not worth a
// reader's drawn ring. `?url&no-inline` because each list sits just under
// Vite's 4 kB inline limit, which would put every one of them in the cold
// load's script as a data URL. The glob is only how a file's hashed URL is
// found: the manifest, not the directory, says what the menu holds.
const files = import.meta.glob('../coordinate-lists/*.csv', {
  query: '?url&no-inline',
  eager: true,
  import: 'default',
}) as Record<string, string>

/**
 * The line the Analyze button's list carries while the last list asked for
 * did not arrive (#838): a refusal or a dropped connection, which only a
 * stale tab or an offline reader meets. The map's own failure line's shape.
 */
export const PRESET_LIST_FAILED_NOTE = 'The list could not load. Try again later.'

export interface PresetList {
  /** The manifest's slug: stable for good, so a share link can name the list by it. */
  id: string
  name: string
  description: string
  /** The name of the region the menu shows it under. */
  region: string
  peaks: number
  url: string
}

export interface PresetRegion {
  name: string
  /** The states the region covers when its heading names none, which a search also matches. */
  places: readonly string[]
}

/** The menu's headings, in its order. One with no list is not shown. */
export const PRESET_REGIONS: readonly PresetRegion[] = manifest.regions.map((region) => ({
  name: region.name,
  places: region.places ?? [],
}))

/** Every list, in the manifest's order, which is the order its region shows them in. */
export const PRESET_LISTS: readonly PresetList[] = manifest.lists.map((list) => ({
  id: list.id,
  name: list.name,
  description: list.description,
  region: list.region,
  peaks: list.peaks,
  url: files[`../coordinate-lists/${list.file}`],
}))

/** The list a share link names by its id (`list=`, #864), or undefined for an id this build does not ship. */
export function presetListById(id: string): PresetList | undefined {
  return PRESET_LISTS.find((list) => list.id === id)
}

// Every list that has arrived this session, by URL, so the field can tell a
// box that holds one from a box that holds the reader's own rows.
const held = new Map<string, string>()

/** The list's text, or null when it cannot be had. Never rejects. */
export async function fetchPresetList(list: PresetList): Promise<string | null> {
  const kept = held.get(list.url)
  if (kept !== undefined) return kept
  try {
    const res = await apiFetch(list.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // Without the file's ending newline: in the box it is an empty last line,
    // which hides one of the two the box shows (the maintainer, 2026-11-03).
    const text = (await res.text()).trimEnd()
    held.set(list.url, text)
    return text
  } catch (err) {
    console.warn('Coordinate list failed to load', err)
    return null
  }
}

/**
 * The list the box holds, when it holds exactly one that arrived this session
 * (a trailing newline aside), else null. What the Coordinate list field reads,
 * and what a share link names in place of the rows (`list=`, #864). A list a
 * link named arrives through `fetchPresetList` like a picked one, so a
 * reloaded page's field reads its name again.
 */
export function presetListIn(box: string): PresetList | null {
  const text = box.trimEnd()
  for (const list of PRESET_LISTS) {
    const kept = held.get(list.url)
    if (kept !== undefined && kept.trimEnd() === text) return list
  }
  return null
}

/** Tests only: forget what arrived. */
export function forgetPresetLists(): void {
  held.clear()
}
