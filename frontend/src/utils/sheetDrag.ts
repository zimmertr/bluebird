// What a phone sheet does under a finger on its grip or its title (#696;
// record 0146): the height a drag holds it at, and where a release leaves it.
// Pure, so the rules are tested off the pointer; `hooks/useSheetDrag.ts`
// wires them to `useGripDrag`, the gesture the results sheet's grips use.

import { clamp } from './numbers'

/**
 * How near a stop a release has to land to be taken to it: a slip of the
 * thumb, well short of any sheet's height. It was the distance a swipe down
 * the grip had to travel to close a sheet before the grip dragged.
 */
export const SHEET_SNAP_PX = 48

/**
 * How fast a release has to be moving to count as a flick, in px per ms (600
 * px a second): a deliberate throw, which a slow drag that happens to end in
 * motion is not. Down closes the sheet, up raises it whole, whatever height
 * it was let go at.
 */
export const SHEET_FLICK_PX_PER_MS = 0.6

/** The window a release's speed is read over: the last tenth of a second. */
export const FLICK_WINDOW_MS = 100

/** The three heights a sheet can be let go to, besides wherever the finger stops. */
export interface SheetStops {
  /** The height it opens at: its rows, or a Controls sheet's own share. */
  restPx: number
  /** The most it rises: one inset under the chip row, or for the Controls sheet the button's strip. */
  fullPx: number
}

/** The height a drag that began at `startPx` holds the sheet at, `upPx` up. */
export function sheetDragPx(startPx: number, upPx: number, fullPx: number): number {
  return clamp(startPx + upPx, 0, fullPx)
}

/** Where a release leaves a sheet: closed, back at its own height, or held. */
export type SheetRelease = { kind: 'close' } | { kind: 'rest' } | { kind: 'hold'; px: number }

/**
 * Where a sheet let go at `px`, moving at `velocityUp` (px per ms, up
 * positive), comes to rest. A flick down closes and a flick up raises it
 * whole. Otherwise a release within `SHEET_SNAP_PX` of a stop takes the
 * nearest one (closed, its own height, full) and anywhere else it stays where
 * the finger left it.
 */
export function sheetRelease(px: number, velocityUp: number, { restPx, fullPx }: SheetStops): SheetRelease {
  if (velocityUp <= -SHEET_FLICK_PX_PER_MS) return { kind: 'close' }
  if (velocityUp >= SHEET_FLICK_PX_PER_MS) return { kind: 'hold', px: fullPx }
  const rest = Math.min(restPx, fullPx)
  const stops: [number, SheetRelease][] = [
    [0, { kind: 'close' }],
    [rest, { kind: 'rest' }],
    [fullPx, rest === fullPx ? { kind: 'rest' } : { kind: 'hold', px: fullPx }],
  ]
  let best: SheetRelease | null = null
  let bestGap = SHEET_SNAP_PX + 1
  for (const [at, release] of stops) {
    const gap = Math.abs(px - at)
    if (gap <= SHEET_SNAP_PX && gap < bestGap) {
      best = release
      bestGap = gap
    }
  }
  return best ?? { kind: 'hold', px }
}

/** One pointer position on the way, for the release's speed. */
export interface DragSample {
  /** The event's timestamp, ms. */
  at: number
  /** The drag so far, up positive, px. */
  upPx: number
}

/**
 * How fast a drag was moving when it was let go, up positive, in px per ms:
 * from the oldest sample inside the last `FLICK_WINDOW_MS` to the release. A
 * finger that stopped before letting go reads 0, however fast it came.
 */
export function releaseVelocity(samples: readonly DragSample[], end: DragSample): number {
  const recent = samples.filter((s) => end.at - s.at <= FLICK_WINDOW_MS && s.at < end.at)
  if (recent.length === 0) return 0
  const from = recent[0]
  return (end.upPx - from.upPx) / (end.at - from.at)
}
