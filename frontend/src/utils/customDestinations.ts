import { CustomDestination } from '../types'

// Parses the "Custom (CSV)" textarea: one "Lat,Lon[,Name]" row per line, with
// blank lines and "#" comments skipped and malformed rows silently dropped.
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
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const parts = l.split(',')
    if (parts.length < 2) continue
    const lat = parseFloat(parts[0].trim())
    const lon = parseFloat(parts[1].trim())
    if (isNaN(lat) || isNaN(lon)) continue
    const name = parts.slice(2).join(',').trim() || `${lat}, ${lon}`
    results.push({ name, latitude: lat, longitude: lon })
  }
  return results
}
