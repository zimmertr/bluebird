import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Whether a card that has just closed is still on its way out (#714; record
 * 0200).
 *
 * A menu leaves the way it came in: it fades and slides back towards its
 * trigger over `MOTION.menu`'s 150ms, because the maintainer's rule for
 * motion is the same animation in both directions. So the card stays mounted
 * after a close for as long as its own transition runs, wearing
 * `data-state="closing"` (which `MOTION.menu` reads for the faded, shifted
 * style and for `pointer-events-none`, so a press during the fade lands on
 * what is under it), and unmounts when that time is up.
 *
 * The time comes off the card's computed transition rather than a copy of
 * the number, so the stylesheet stays the one place it is spelled: a reader
 * who asked for less motion gets `transition-property: none` from
 * `motion-reduce:`, and the card goes at once. So does a card in jsdom, which
 * has no stylesheet, and that is what keeps every test that reads "closed" as
 * "gone" true without waiting.
 *
 * Everything else about a close happens on its first frame, not its last.
 * The caller's `open` is false at once, so `aria-expanded` and every
 * dismiss listener follow it there. And a keyboard inside the card goes back
 * to `returnRef` now: left there, it would fall to the body when the card
 * unmounted, after the frame `useTakeOrphanedFocus` looks. A reopen during the
 * fade cancels it, and the card turns round where it stands.
 */
export function useExit(
  open: boolean,
  cardRef: RefObject<HTMLElement | null>,
  returnRef: RefObject<HTMLElement | null>,
): boolean {
  const [wasOpen, setWasOpen] = useState(open)
  const [closing, setClosing] = useState(false)
  // Derived during render, so the commit that closes the card is the one that
  // marks it closing: a frame between the two would draw it gone.
  if (wasOpen !== open) {
    setWasOpen(open)
    setClosing(!open)
  }

  useLayoutEffect(() => {
    if (!closing) return
    const card = cardRef.current
    if (!card) {
      setClosing(false)
      return
    }
    if (card.contains(document.activeElement)) returnRef.current?.focus({ preventScroll: true })
    const ms = exitMs(card)
    if (ms === 0) {
      setClosing(false)
      return
    }
    const timer = window.setTimeout(() => setClosing(false), ms)
    return () => window.clearTimeout(timer)
  }, [closing, cardRef, returnRef])

  return closing
}

/** How long the card's longest transition runs, delay included; 0 for none. */
function exitMs(el: HTMLElement): number {
  const style = getComputedStyle(el)
  if (!style.transitionProperty || style.transitionProperty === 'none') return 0
  const durations = seconds(style.transitionDuration)
  const delays = seconds(style.transitionDelay)
  // The two lists repeat to the length of the longer one, as CSS does.
  return Math.max(0, ...durations.map((d, i) => (d + (delays[i % delays.length] ?? 0)) * 1000))
}

function seconds(list: string): number[] {
  return list.split(',').map((raw) => {
    const value = parseFloat(raw)
    if (!Number.isFinite(value)) return 0
    return raw.trim().endsWith('ms') ? value / 1000 : value
  })
}
