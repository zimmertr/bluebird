import { fetchClosures } from '../utils/closures'
import { type ClosureWarning, closureFor } from '../utils/closureProximity'
import { uncoveredKeys } from '../utils/fireProximity'
import { geoKey } from '../utils/points'
import { type ProximityCheck, type ProximityLookup, useProximityCheck } from './useProximityCheck'

// For each destination inside an active Forest Service area closure, returns
// a map (keyed by geoKey(lat, lon)) to its closure, alongside the state of the
// lookup itself (#550). The Closure column's twin of useFireProximity, and the
// same contract on purpose: keyed by coordinate so a warning finds its row
// after a re-sort, independent of the closure layers' toggles, and fed the
// analysis's candidate FIELD rather than the rows on screen, so a live knob
// never re-asks the pod.
//
// It rides the fire check's field and sequence (`fireField`/`fireSeq` in
// useAnalysisReport.ts) rather than a pair of its own: both checks are one
// lookup per analysis over the same candidate field, published at discovery
// so each overlaps the weather fetch, and a second publisher would be a
// second answer to "which destinations does this analysis cover". The
// lifecycle is one too: useProximityCheck runs both.

export type ClosureProximity = ProximityCheck<ClosureWarning>

const CLOSURE_LOOKUP: ProximityLookup<ClosureWarning> = {
  label: 'closure lookup',
  // A polygon that holds a point intersects every box around that point, so
  // the test itself needs no margin. The mile keeps a one-destination field's
  // box from being a single point, and costs the query nothing it would notice.
  marginMi: 1,
  async find(bbox, points, signal) {
    // The coarse copy, as the fire check reads. Its ~56 m of
    // simplification can move a boundary only for a destination standing
    // on the line itself, and the reader of such a row reads the order
    // either way, so the full copy's bytes would buy nothing they can act
    // on.
    const areas = await fetchClosures(bbox, 'area', 'coarse', signal)
    // Which rows the feed cannot see, from the coverage the server
    // publishes beside the data: outside the area feeds' coverage an
    // empty answer is "not covered", not "no order", and the cell says N/A.
    const uncovered = uncoveredKeys(points, areas.coverage)
    const warnings = new Map<string, ClosureWarning>()
    for (const p of points) {
      const key = geoKey(p.latitude, p.longitude)
      if (uncovered.has(key)) continue
      const hit = closureFor(p.latitude, p.longitude, areas)
      if (hit) warnings.set(key, hit)
    }
    return { warnings, uncovered }
  },
}

/**
 * @param field the destinations to check; only coordinates are read
 * @param seq bumped once per analysis (`fireSeq`), so clicking Analyze
 *   re-asks even when the destinations are identical.
 * @param layerOn whether the area closures layer is on; switching it on asks
 *   a failed check again at once (see useProximityCheck).
 */
export function useClosureProximity(
  field: { latitude: number; longitude: number }[],
  seq = 0,
  layerOn = false,
): ClosureProximity {
  return useProximityCheck(CLOSURE_LOOKUP, field, seq, layerOn)
}
