import { useEffect, useMemo, useRef, useState } from 'react'
import type { PanelMessages } from './usePanelMessages'

/**
 * Opens something the moment a run fails (#803), or a check or the basemap
 * does (#834, keyed on `openingSeq` instead): the message list over the
 * panel's Analyze at a desk, the Messages sheet on a phone, and a desk's
 * panel itself when it is shut. A failed run used to show itself only as a
 * count on the badge, which a reader took for no error at all, so a failure
 * now opens the list the badge would.
 *
 * Keyed on `failureSeq` (`useAnalysisRun`), which moves once per run that
 * ends in an error or a refusal and never for a cancel. The count it opened
 * on is kept, so a re-render, a new `open` or a change of `enabled` opens
 * nothing, and the count at mount is taken as seen: a panel mounted after a
 * failure does not open on it. With `enabled` false a failure is passed over
 * rather than saved for later: the phone's panel footer carries no list, and
 * a desk's panel that is shut opens through its own call.
 */
export function useOpenOnFailure(failureSeq: number, open: () => void, enabled = true): void {
  const seen = useRef(failureSeq)
  useEffect(() => {
    if (failureSeq === seen.current) return
    seen.current = failureSeq
    if (enabled) open()
  }, [failureSeq, open, enabled])
}

/**
 * The messages a desk's panel reads, with a failure held back while the
 * panel is shut or sliding (#803). The list is a card placed against the
 * Analyze button when it opens, and a card placed against a button still off
 * the screen stays where it was placed. So a failure that reopens the panel
 * reaches its list once the panel stands still, and opens it there. A check
 * or basemap failure (`openingSeq`, #834) reopens the panel too, and is held
 * the same way.
 *
 * Only the two counts are held; every message and the gate pass through as
 * they are.
 */
export function useHeldFailure(messages: PanelMessages, hold: boolean): PanelMessages {
  const [released, setReleased] = useState({ failureSeq: messages.failureSeq, openingSeq: messages.openingSeq })
  useEffect(() => {
    if (!hold) setReleased({ failureSeq: messages.failureSeq, openingSeq: messages.openingSeq })
  }, [hold, messages.failureSeq, messages.openingSeq])
  const failureSeq = hold ? released.failureSeq : messages.failureSeq
  const openingSeq = hold ? released.openingSeq : messages.openingSeq
  return useMemo(
    () =>
      failureSeq === messages.failureSeq && openingSeq === messages.openingSeq
        ? messages
        : { ...messages, failureSeq, openingSeq },
    [messages, failureSeq, openingSeq],
  )
}
