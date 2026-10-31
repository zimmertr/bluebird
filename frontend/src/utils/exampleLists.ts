import { apiFetch } from './apiFetch'
import bulgers from '../csv-examples/washington-bulger-list.csv?no-inline'
import rainier from '../csv-examples/mountaineers-100-peaks-at-mount-rainier-np.csv?no-inline'
import smoot from '../csv-examples/smoots-climbing-washingtons-mountains-100-peaks.csv?no-inline'
import homeCourt from '../csv-examples/alpine-lakes-home-court-top-100.csv?no-inline'

// The ready-made lists the note beside Coordinate search loads into the box
// (#838), each a hashed asset fetched on the press that asks for it. A fetch
// rather than a lazy `import()` for `usStatesLoad.ts`'s reason: a stale tab's
// failed import reloads the page (`staleChunk.ts`), and a list is not worth a
// reader's drawn ring. `?no-inline` because each list sits just under Vite's
// 4 kB inline limit, which would put all four in the cold load's script as
// data URLs.

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

/** The list's text, or null when it cannot be had. Never rejects. */
export async function fetchExampleList(list: ExampleList): Promise<string | null> {
  try {
    const res = await apiFetch(list.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    console.warn('Example list failed to load', err)
    return null
  }
}

/**
 * The box once a list lands: the list alone in an empty box, else under the
 * rows already there, so a press never costs a reader what they typed. A row
 * in both is analyzed once, as a line pasted twice already is.
 */
export function withList(current: string, list: string): string {
  return current.trim() === '' ? list : `${current.trimEnd()}\n${list}`
}
