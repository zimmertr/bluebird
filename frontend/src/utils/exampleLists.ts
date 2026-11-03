import { apiFetch } from './apiFetch'
import bulgers from '../csv-examples/washington-bulger-list.csv?url&no-inline'
import rainier from '../csv-examples/mountaineers-100-peaks-at-mount-rainier-np.csv?url&no-inline'
import smoot from '../csv-examples/smoots-climbing-washingtons-mountains-100-peaks.csv?url&no-inline'
import homeCourt from '../csv-examples/alpine-lakes-home-court-top-100.csv?url&no-inline'

// The ready-made lists the Example list field under Coordinate search puts in
// the box (#838), each a hashed asset fetched on the pick that asks for it. A fetch
// rather than a lazy `import()` for `usStatesLoad.ts`'s reason: a stale tab's
// failed import reloads the page (`staleChunk.ts`), and a list is not worth a
// reader's drawn ring. `?url&no-inline` because each list sits just under Vite's
// 4 kB inline limit, which would put all four in the cold load's script as
// data URLs.

/**
 * The line the Analyze button's list carries while the last list asked for
 * did not arrive (#838): a refusal or a dropped connection, which only a
 * stale tab or an offline reader meets. The map's own failure line's shape.
 */
export const EXAMPLE_LIST_FAILED_NOTE = 'The list could not load. Try again later.'

export interface ExampleList {
  name: string
  url: string
}

export const EXAMPLE_LISTS: readonly ExampleList[] = [
  { name: 'The Bulger List', url: bulgers },
  { name: 'Mountaineers 100 Peaks at Mount Rainier', url: rainier },
  { name: "Smoot's 100 Peaks", url: smoot },
  { name: 'Alpine Lakes Home Court Top 100', url: homeCourt },
]

// Every list that has arrived this session, by URL, so the field can tell a
// box that holds one from a box that holds the reader's own rows.
const held = new Map<string, string>()

/** The list's text, or null when it cannot be had. Never rejects. */
export async function fetchExampleList(list: ExampleList): Promise<string | null> {
  const kept = held.get(list.url)
  if (kept !== undefined) return kept
  try {
    const res = await apiFetch(list.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    held.set(list.url, text)
    return text
  } catch (err) {
    console.warn('Example list failed to load', err)
    return null
  }
}

/**
 * The list the box holds, when it holds exactly one that arrived this session
 * (a trailing newline aside), else null. What the Example list field reads,
 * and what lets a pick replace the box without asking: a list is nothing the
 * reader typed. A share link restores the rows and not this, so a reloaded
 * page reads such a box as Custom until a list is picked again.
 */
export function exampleListIn(box: string): ExampleList | null {
  const text = box.trimEnd()
  for (const list of EXAMPLE_LISTS) {
    const kept = held.get(list.url)
    if (kept !== undefined && kept.trimEnd() === text) return list
  }
  return null
}

/** Tests only: forget what arrived. */
export function forgetExampleLists(): void {
  held.clear()
}
