import { fetchWildfires } from '../utils/wildfires'
import {
  FireWarning,
  FIRE_WARN_MILES,
  nearestFire,
  uncoveredKeys,
} from '../utils/fireProximity'
import { geoKey } from '../utils/points'
import { type ProximityCheck, type ProximityLookup, useProximityCheck } from './useProximityCheck'

// For each destination within FIRE_WARN_MILES of an active US wildfire, returns
// a map (keyed by geoKey(lat, lon)) to its nearest-fire warning, alongside the
// state of the lookup itself. Keyed by coordinate rather than by row position,
// so a warning still finds its row after the results table is re-sorted on the
// client. Independent of the map overlay toggle — this is safety info, not a
// display option. Only the panel's notice about a failed check follows the
// overlay (`checkNoticeDue` in utils/fireProximity.ts).
//
// Takes the analysis's candidate FIELD, not the rows on screen. Since #188 the
// displayed rows are re-derived on every sort, limit and elevation change, so
// keying off them would fire a NIFC query per knob twiddle. The field changes
// once per analysis — published at discovery so this lookup overlaps the
// weather fetch — and warnings for destinations below the cut are simply never
// looked up: cheap, since the extra work is local distance math against one
// query's perimeters rather than another request. Only coordinates are read,
// which is what lets a pre-forecast candidate stand in for a result row.
//
// The lifecycle (one lookup per analysis, the retries, asking again after a
// failure) is useProximityCheck's, shared with the closure check.

export type FireProximity = ProximityCheck<FireWarning>

const FIRE_LOOKUP: ProximityLookup<FireWarning> = {
  label: 'wildfire proximity lookup',
  marginMi: FIRE_WARN_MILES + 1,
  async find(bbox, points, signal) {
    // The coarse copy, deliberately (TJ, PR #275 review). Its ~56 m of
    // simplification is 0.035 mi against a FIRE_WARN_MILES threshold and
    // a cell that rounds to 0.1 mi, so it cannot change any displayed
    // answer — and it is about a thirteenth of the full copy's bytes
    // (measured: 210 KB vs 3.3 MB for a Washington-sized field).
    const fires = await fetchWildfires(bbox, 'coarse', signal)
    // Which rows the dataset could not see, from the coverage the server
    // publishes beside the data (#256). Kept per row: an uncovered
    // destination's wildfire cell reads the no-data dash in the table and
    // the CSV, while its covered neighbours keep their real answers.
    const uncovered = uncoveredKeys(points, fires.coverage)
    const warnings = new Map<string, FireWarning>()
    for (const r of points) {
      if (uncovered.has(geoKey(r.latitude, r.longitude))) continue
      const near = nearestFire(r.latitude, r.longitude, fires)
      if (near && near.miles <= FIRE_WARN_MILES) {
        warnings.set(geoKey(r.latitude, r.longitude), near)
      }
    }
    return { warnings, uncovered }
  },
}

/**
 * @param field the destinations to check; only coordinates are read
 * @param seq bumped once per analysis, when its field is published, so
 *   clicking Analyze re-asks even when the destinations are identical. It
 *   also keeps the documented contract of one query per analysis, which
 *   matters because perimeters move.
 * @param layerOn whether the Wildfires layer is on; switching it on asks a
 *   failed check again at once (see useProximityCheck).
 */
export function useFireProximity(
  field: { latitude: number; longitude: number }[],
  seq = 0,
  layerOn = false,
): FireProximity {
  return useProximityCheck(FIRE_LOOKUP, field, seq, layerOn)
}
