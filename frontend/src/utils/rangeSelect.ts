import type { SyntheticEvent } from 'react'

/**
 * Shift-click range selection over a list of checkboxes (the maintainer,
 * 2026-10-21; record 0209): a press with Shift held sets every box between
 * the last one pressed and this one, both included, to the state this one is
 * taking. The convention every file manager and mail list follows, so a
 * reader who learnt it there finds it here.
 *
 * The pure half: which keys a press reaches, in the list's own order.
 * `anchor` is the key last pressed in this list, or null before any press,
 * when the range is the one key. A target the list no longer holds reaches
 * nothing. A box the range crosses that cannot be pressed (a ranked column,
 * a greyed layer, the last model) is the caller's to leave out, since what
 * holds it is the caller's rule.
 */
export function rangeKeys(order: readonly string[], anchor: string | null, target: string): string[] {
  const to = order.indexOf(target)
  if (to < 0) return []
  const from = anchor === null ? -1 : order.indexOf(anchor)
  if (from < 0) return [target]
  const [first, last] = from <= to ? [from, to] : [to, from]
  return order.slice(first, last + 1)
}

/**
 * Whether Shift was held for the press behind a checkbox's change. React
 * raises `onChange` for a checkbox from the click that toggled it, so the
 * native event under it is that click; a change the keyboard made carries no
 * mouse event and reads as a plain press.
 */
export function shiftHeld(e: SyntheticEvent): boolean {
  const native = e.nativeEvent
  return typeof MouseEvent !== 'undefined' && native instanceof MouseEvent && native.shiftKey
}
