import { useCallback, useEffect, useState } from 'react'
import type { PanelSectionId } from '../utils/controlsSummary'

/**
 * Which section of a desk's controls card is open (#825; record 0305). One at
 * a time: opening a section collapses the one that was open, and a press on
 * the open one's heading collapses it. Destinations is open on arrival, where
 * every analysis starts. A committed report collapses every section to its
 * summary line (the maintainer, 2026-11-16), so the card is at its shortest
 * over the map the reader now wants; keyed on `analysisSeq`, which moves only
 * when a report commits, so a refusal or a failure leaves the section the
 * reader was in open.
 *
 * `held` is the section the tutorial's step lights, which shows open for the
 * length of that step and gives the reader's own back after it.
 */
export function useCardSections({ analysisSeq, held }: { analysisSeq: number; held: PanelSectionId | null }) {
  const [own, setOwn] = useState<PanelSectionId | null>('destinations')
  useEffect(() => {
    if (analysisSeq > 0) setOwn(null)
  }, [analysisSeq])
  const toggle = useCallback((id: PanelSectionId) => setOwn((was) => (was === id ? null : id)), [])
  return { section: held ?? own, toggle }
}
