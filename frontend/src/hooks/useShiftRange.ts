import { useCallback, useEffect, useRef } from 'react'
import { rangeKeys } from '../utils/rangeSelect'

/**
 * The anchor behind a list's shift-click range (record 0209): the key last
 * pressed, held while the menu is open and forgotten when it closes, so a
 * range never reaches back to a press the reader made before the menu was
 * last up. Returns the one press: the keys a press on `key` sets, in the
 * list's `order`, and it moves the anchor to `key` whether or not Shift was
 * held. The rule itself is `rangeKeys`.
 */
export function useShiftRange(open: boolean): (order: readonly string[], key: string, shift: boolean) => string[] {
  const anchor = useRef<string | null>(null)
  useEffect(() => {
    if (!open) anchor.current = null
  }, [open])
  return useCallback((order: readonly string[], key: string, shift: boolean) => {
    const keys = shift ? rangeKeys(order, anchor.current, key) : [key]
    anchor.current = key
    return keys
  }, [])
}
