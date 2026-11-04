import { apiFetch } from './apiFetch'

// The ready-made lists the Coordinate list field under Coordinate search puts in
// the box (#838, record 0263). The directory is the list: every file in
// `src/coordinate-lists/` is one entry, so adding or removing a file changes
// the next build and nothing else. The file's name is the menu's string, so a
// new file's name is a user-facing string the maintainer approves before it
// lands, and the menu reads alphabetically because that is the only order a
// directory can state.
//
// Each is a hashed asset fetched on the pick that asks for it. A fetch rather
// than a lazy `import()` for `usStatesLoad.ts`'s reason: a stale tab's failed
// import reloads the page (`staleChunk.ts`), and a list is not worth a
// reader's drawn ring. `?url&no-inline` because each list sits just under
// Vite's 4 kB inline limit, which would put every one of them in the cold
// load's script as a data URL.
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
  name: string
  url: string
}

export const PRESET_LISTS: readonly PresetList[] = Object.entries(files)
  .map(([path, url]) => ({ name: path.slice(path.lastIndexOf('/') + 1, -'.csv'.length), url }))
  .sort((a, b) => a.name.localeCompare(b.name))

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
 * (a trailing newline aside), else null. What the Coordinate list field reads.
 * A share link restores the rows and not this, so a reloaded page's field
 * reads Custom coordinates over such a box until a list is picked again.
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
