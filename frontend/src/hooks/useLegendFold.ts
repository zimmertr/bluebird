import { useCallback, useState } from 'react'
import { legendDefaultOpen } from '../utils/resultsSheet'
import { writeViewPrefs } from '../utils/viewPrefs'
import { DEFAULT_PANEL_HEIGHT, useViewportHeight } from './useResultsLayout'

/**
 * Whether the legend card is open: the reader's last press on its header, or
 * the default until they make one (#696). The default is open on every device
 * unless the viewport is too short for it (the maintainer, 2026-10-13): when
 * the results first open, the band of map under the open card must still hold
 * one marker and its name (`legendDefaultOpen`). A short window, or a phone
 * turned on its side, opens folded.
 *
 * The same shape as the forecast player's switch (`useMapOverlays`), and for
 * its reason: the default is the device's, so only a reader's own answer is
 * stored, and a browser that pressed nothing keeps following its viewport,
 * a rotation included.
 */
export function legendExpanded(
  choice: boolean | null,
  { viewportH, isDesktop }: { viewportH: number; isDesktop: boolean },
): boolean {
  return choice ?? legendDefaultOpen({ viewportH, docked: isDesktop, panelPx: DEFAULT_PANEL_HEIGHT })
}

export function useLegendFold(stored: boolean | null, isDesktop: boolean) {
  const [choice, setChoice] = useState(stored)
  const viewportH = useViewportHeight()
  const expanded = legendExpanded(choice, { viewportH, isDesktop })
  // Stored beside the other view preferences, never in the link: a fold is a
  // habit of this browser, and a link is the session someone shares.
  const toggleLegend = useCallback(() => {
    const next = !expanded
    setChoice(next)
    writeViewPrefs({ legendOpen: next })
  }, [expanded])
  return { legendExpanded: expanded, toggleLegend }
}

export type LegendFold = ReturnType<typeof useLegendFold>
