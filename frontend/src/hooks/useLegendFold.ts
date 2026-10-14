import { useCallback, useState } from 'react'
import { writeViewPrefs } from '../utils/viewPrefs'

/**
 * Whether the legend box hangs open: the reader's last press on its strip, or
 * the device's answer until they make one (#696). Open on a desktop, where the
 * map has room for the key beside the markers it explains; folded on a phone,
 * where the box stood across the map's left column as soon as a report
 * landed, and where the strip says the key is there for a tap.
 *
 * The same shape as the forecast player's switch (`useMapOverlays`), and for
 * its reason: the default is the device's, so only a reader's own answer is
 * stored, and a browser that pressed nothing keeps following its width.
 */
export function legendExpanded(choice: boolean | null, isDesktop: boolean): boolean {
  return choice ?? isDesktop
}

export function useLegendFold(stored: boolean | null, isDesktop: boolean) {
  const [choice, setChoice] = useState(stored)
  const expanded = legendExpanded(choice, isDesktop)
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
