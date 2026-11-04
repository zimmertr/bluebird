import { CustomDestination } from '../types'
import { onGlobe } from './points'

// What `readLine` answers for a line that is not a row: one the format skips
// on purpose, and one that reads as no row.
const SKIPPED = 'skipped'
const UNREAD = 'unread'

// Parses the "Custom (CSV)" textarea: one "Lat,Lon[,Name]" row per line, with
// blank lines and "#" comments skipped and malformed rows dropped. A
// row whose latitude is outside -90..90 or longitude outside -180..180 is
// malformed too.
// Lived as an identical copy in both App.tsx (which feeds the analyze request)
// and ControlPanel.tsx (which only counts rows) until they were unified here —
// the two must agree, and a change to one that missed the other is exactly the
// drift this dedup prevents.
//
// The optional third field onward is a free-form label; everything after the
// second comma is kept verbatim, so a label may itself contain commas ("Camp
// Muir, WA"). When it's absent or blank the destination is named by its own
// coordinate pair (echoing the parsed values, so "46.85290" → "46.8529") —
// deriving a real place name from bare coordinates would mean a reverse-geocode
// round trip per row, and the coordinates the user typed are the honest,
// zero-cost fallback.
export function parseCustomCsv(csv: string): CustomDestination[] {
  const results: CustomDestination[] = []
  for (const raw of csv.split('\n')) {
    const row = readLine(raw)
    if (row !== SKIPPED && row !== UNREAD) results.push(row)
  }
  return results
}

/**
 * For each line of the box, whether `parseCustomCsv` drops it as malformed:
 * a line that is neither blank nor a `#` comment and reads as no row. The
 * coordinates box's gutter flags these and the caption under it counts them
 * (record 0265), so a dropped line is shown rather than left out of the count
 * without a word. Both read `readLine`, so the flag and the parse cannot
 * disagree.
 */
export function unreadLines(csv: string): boolean[] {
  return csv.split('\n').map((raw) => readLine(raw) === UNREAD)
}

// One line of the box: a row, a line the format skips on purpose (blank, or
// a "#" comment), or a line that reads as no row.
function readLine(raw: string): CustomDestination | typeof SKIPPED | typeof UNREAD {
  const l = raw.trim()
  if (!l || l.startsWith('#')) return SKIPPED
  const parts = l.split(',')
  if (parts.length < 2) return UNREAD
  const lat = parseFloat(parts[0].trim())
  const lon = parseFloat(parts[1].trim())
  // Not a number, or off the globe: the same bounds every route holds a
  // coordinate to. Kept, an off-globe pair would ride into every request
  // built from the list: the wildfire and closure boxes span it, so those
  // routes refuse the whole box and every valid row loses its check along
  // with the bad one.
  if (!onGlobe(lat, lon)) return UNREAD
  const name = parts.slice(2).join(',').trim() || `${lat}, ${lon}`
  return { name, latitude: lat, longitude: lon }
}
