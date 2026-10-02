import { type RefObject, useEffect } from 'react'
import type { MapViewHandle } from '../components/MapView'

/**
 * A committed report closes every popup on the map, shift-pinned ones
 * included (the maintainer, 2026-10-01, #577).
 *
 * A result popup is HTML built once, from the rows as they stood when it
 * opened, and it names no window. Left open across an Analyze it went on
 * showing the old report's numbers under a rank the new report may give to
 * another place, with nothing on it to say so. Closing is the whole answer:
 * a click on the marker opens the new report's card.
 *
 * A run that is discarded after showing partial rows closes them too
 * (#560): a card opened over those rows names a row the report put back may
 * not hold. `discardSeq` moves for that and nothing else, so a run cancelled
 * before any row arrived leaves the cards over the standing report open.
 *
 * Keyed on those two events alone, so a live knob, which re-presents the same
 * report, leaves an open card where it is. Through the map handle rather than
 * a prop, because `MapView` is memoized and Analyze is a panel click the map
 * never sees. Its own hook rather than an effect in `App.tsx`, because that
 * file renders the map and cannot run under Vitest.
 */
export function useClosePopupsOnCommit(
  analysisSeq: number,
  mapRef: RefObject<MapViewHandle | null>,
  discardSeq = 0,
): void {
  useEffect(() => {
    if (analysisSeq > 0 || discardSeq > 0) mapRef.current?.closePopups()
  }, [analysisSeq, discardSeq, mapRef])
}
