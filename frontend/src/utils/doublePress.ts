// A double press on a handle whose drag starts on pointerdown: the results
// area's grips (`hooks/useGripDrag.ts`) and every corner that sizes a card
// (record 0270). The browser's own dblclick is no use on any of them: the drag
// begins on the first pointerdown and preventDefault stops the pair of clicks
// resolving, and a finger's second tap on a handle that captured the pointer
// may raise none. So each handle times its own pointerdowns.

// How close two presses must be to count as a double press. 350ms is a shade
// over the usual system threshold, which is the right way to miss.
export const DOUBLE_PRESS_MS = 350

// How far apart two presses may land and still be one double press, in either
// axis: the side of the largest corner handle, `CARD_RESIZE`'s 32px box under
// a finger, so two taps on a handle that has not moved always pass. Two
// presses farther apart than that are a drag and a fresh grab of a handle the
// drag moved, and the second is a drag of its own.
export const DOUBLE_PRESS_SLOP_PX = 32

/** One press: when, and where on the page. */
export interface Press {
  at: number
  x: number
  y: number
}

/** The last press a handle heard, which a React ref already is. */
export interface PressClock {
  current: Press | null
}

/** Whether `press` is the second of a double press after `previous`. */
export function isSecondPress(previous: Press | null, press: Press): boolean {
  if (previous === null) return false
  return (
    press.at - previous.at < DOUBLE_PRESS_MS &&
    Math.abs(press.x - previous.x) <= DOUBLE_PRESS_SLOP_PX &&
    Math.abs(press.y - previous.y) <= DOUBLE_PRESS_SLOP_PX
  )
}

/**
 * Record a pointerdown on a handle's clock and say whether it is the second of
 * a double press. Each handle keeps its own clock, so a double press resets
 * what it was made on and nothing else.
 */
export function secondPress(clock: PressClock, e: { timeStamp: number; clientX: number; clientY: number }): boolean {
  const press = { at: e.timeStamp, x: e.clientX, y: e.clientY }
  const second = isSecondPress(clock.current, press)
  clock.current = press
  return second
}

/**
 * Cancel the next touch's end on the document, or stand down if the touch is
 * cancelled first (#837). Firefox for Android synthesizes a tap's click, and a
 * double tap's dblclick, on whatever stands under the finger when it lifts,
 * hit tested anew, so a double press that put something back and moved it out
 * from under the finger left the map there, which zoomed or opened a card. A
 * cancelled touchend tells a browser to synthesize no mouse event for the
 * touch, and the pointer events a handle reads are sent before it.
 */
export function cancelTouchEnd() {
  const cancel = (ev: TouchEvent) => {
    ev.preventDefault()
    off()
  }
  const off = () => {
    document.removeEventListener('touchend', cancel)
    document.removeEventListener('touchcancel', off)
  }
  document.addEventListener('touchend', cancel, { passive: false })
  document.addEventListener('touchcancel', off)
}
