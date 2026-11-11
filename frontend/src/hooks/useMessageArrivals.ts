import { useEffect, useRef, useState } from 'react'
import type { FooterMessage } from '../utils/notices'
import { LIST_OPENING_KEYS } from '../utils/panelMessages'

/** Two counts of messages arriving, which the badge and the list key on (#834). */
export interface MessageArrivals {
  /** Moves once per render that shows a message the last one did not, which the badge moves on. */
  arrivalSeq: number
  /** Moves once per arrival of a line in `LIST_OPENING_KEYS`, which opens the list. */
  openingSeq: number
}

/**
 * What arrived in the list the reader sees (#834): a key that was not there
 * the render before, after dismissals, so a line the reader dismissed is not
 * news while its condition holds, and is news again once it clears and comes
 * back. Two counts, because every arrival moves the badge and only a check or
 * the basemap failing opens the list.
 *
 * The messages at mount are taken as seen: the blocker a fresh page carries
 * is the panel's starting state, not news.
 */
export function useMessageArrivals(messages: readonly FooterMessage[]): MessageArrivals {
  const [arrivals, setArrivals] = useState<MessageArrivals>({ arrivalSeq: 0, openingSeq: 0 })
  const seen = useRef<ReadonlySet<string> | null>(null)
  const keySig = messages.map((m) => m.key).join('\u0000')
  useEffect(() => {
    const keys = keySig === '' ? [] : keySig.split('\u0000')
    const before = seen.current
    seen.current = new Set(keys)
    if (before === null) return
    const added = keys.filter((k) => !before.has(k))
    if (added.length === 0) return
    const opens = added.some((k) => LIST_OPENING_KEYS.has(k))
    setArrivals((was) => ({
      arrivalSeq: was.arrivalSeq + 1,
      openingSeq: was.openingSeq + (opens ? 1 : 0),
    }))
  }, [keySig])
  return arrivals
}
