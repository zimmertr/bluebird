import type { MouseEvent } from 'react'
import { TUTORIAL_PATH } from '../utils/tourSteps'
import { LINK, LINK_INERT } from '../styles'

interface Props {
  /** Starts the tour over this page. */
  onTutorial: () => void
  /** A draw or a run is up, and the tour would start over it: the link answers no click. */
  tutorialWaits?: boolean
  className?: string
}

/**
 * The three document links: the tour, the privacy page and the terms. The
 * panel's footer carried them; at a desk with the sentence bar they stand on
 * the map's credit line (record 0308), so one component spells them for both.
 *
 * Two labels, two pages, and each label goes where it says. The privacy copy
 * used to open a dialog, which meant it had no URL and the Terms link next to
 * it pointed at the privacy page anyway. Both open in a new tab so reading
 * either never costs you a drawn polygon and its results.
 */
export default function DocLinks({ onTutorial, tutorialWaits = false, className }: Props) {
  // A plain click starts the tour over this page; a modified click or a
  // middle click is the browser's, and opens the path like any link. While
  // the tour waits the link answers no click at all, the new-tab ones
  // included, since the page it would open starts the tour the same way.
  function startTour(e: MouseEvent<HTMLAnchorElement>) {
    if (tutorialWaits) {
      e.preventDefault()
      return
    }
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onTutorial()
  }

  return (
    <p className={className}>
      {/* A real link to the tour's path, so it can be copied or opened in a
          new tab like the two beside it; the tour writes the same path to
          the address bar (#536). */}
      <a href={TUTORIAL_PATH} onClick={startTour} aria-disabled={tutorialWaits || undefined} className={`${LINK} ${LINK_INERT}`}>
        Tutorial
      </a>
      {' · '}
      <a href="/privacy" target="_blank" rel="noreferrer" className={LINK}>
        Privacy
      </a>
      {' · '}
      <a href="/terms" target="_blank" rel="noreferrer" className={LINK}>
        Terms
      </a>
    </p>
  )
}
