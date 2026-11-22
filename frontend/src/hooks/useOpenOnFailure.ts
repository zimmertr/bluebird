import { useEffect, useRef } from 'react'

/**
 * Opens something the moment a run fails (#803), or a check or the basemap
 * does (#834, keyed on `openingSeq` instead): the message list over the
 * sentence bar's Forecast button at a desk, the Messages sheet on a phone. A
 * failed run used to show itself only as a count on the badge, which a reader
 * took for no error at all, so a failure now opens the list the badge would.
 *
 * Keyed on `failureSeq` (`useAnalysisRun`), which moves once per run that
 * ends in an error or a refusal and never for a cancel. The count it opened
 * on is kept, so a re-render or a new `open` opens nothing, and the count at
 * mount is taken as seen: a button mounted after a failure does not open on
 * it.
 */
export function useOpenOnFailure(failureSeq: number, open: () => void): void {
  const seen = useRef(failureSeq)
  useEffect(() => {
    if (failureSeq === seen.current) return
    seen.current = failureSeq
    open()
  }, [failureSeq, open])
}
