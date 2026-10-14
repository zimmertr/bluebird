import { useState } from 'react'

/**
 * The height a drag left a sheet that never unmounts at (the Controls sheet,
 * #696; record 0146), or null for its own. Each opening starts at its own
 * height, the way a menu that mounts afresh does: a drag is how this opening
 * was read, not a setting. Reset in render rather than in an effect, so the
 * sheet never draws a frame at the last opening's height.
 */
export function useHeldSheetPx(open: boolean) {
  const [heldPx, setHeldPx] = useState<number | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setHeldPx(null)
  }
  return [heldPx, setHeldPx] as const
}
