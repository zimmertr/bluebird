import { TOUR } from '../styles'
import { PACE } from './act'

// The drawn pointer the tutorial acts with (#536). It glides to a control,
// sends a ring out from its tip on a press, and is hidden on steps that only
// point and whenever a step runs instantly. Its tip is the element's own
// top-left corner, so a translate to a point puts the tip on it.

/** What the pointer reads its speed from: the step it is acting for. */
export interface PointerPace {
  instant(): boolean
  hurried: Promise<void>
}

export interface Pointer {
  glide(to: { x: number; y: number }, pace: PointerPace): Promise<void>
  /** A ring from the tip, gone as soon as `on` leaves the page or moves. */
  press(pace: PointerPace, on?: Element): void
  hide(): void
  remove(): void
}

const PRESS_MS = 450
const FADE_MS = 200

// An arrow with its tip at (2, 2), drawn in a 24-unit box.
const ARROW =
  '<path d="M2 2 L2 19 L6.5 14.8 L9.6 21.6 L12.6 20.3 L9.6 13.6 L15.6 13.4 Z" ' +
  'stroke-width="1.5" stroke-linejoin="round" />'

// How much faster than its average a glide that eases in and out is at its
// middle: the peak slope of CSS's `ease-in-out` curve.
const EASE_PEAK = 1.6

/**
 * How long a glide over `px` takes: never under the shortest glide, and long
 * enough that the pointer's top speed stays under `PACE.glidePeakPxPerS`, so
 * a long move takes longer rather than going faster.
 */
export function glideMs(px: number): number {
  return Math.round(Math.max(PACE.glideMinMs, (px * EASE_PEAK * 1000) / PACE.glidePeakPxPerS))
}

export function createPointer(): Pointer {
  const el = document.createElement('div')
  el.className = TOUR.pointer
  el.setAttribute('aria-hidden', 'true')
  el.style.opacity = '0'
  el.innerHTML = `<svg viewBox="0 0 24 24" class="${TOUR.pointerArrow}" style="margin:-2px 0 0 -2px">${ARROW}</svg>`
  document.body.appendChild(el)
  // It first enters from the lower right of the screen, where no control sits.
  let at = { x: window.innerWidth * 0.75, y: window.innerHeight * 0.8 }
  let shown = false

  function place(to: { x: number; y: number }, ms: number) {
    el.style.transitionDuration = `${ms}ms`
    el.style.transform = `translate(${to.x}px, ${to.y}px)`
    at = to
  }

  function hide() {
    el.style.transitionDuration = '0ms'
    el.style.opacity = '0'
    shown = false
  }

  return {
    async glide(to, pace) {
      if (pace.instant()) {
        hide()
        place(to, 0)
        return
      }
      if (!shown) {
        // Appears where it last stood, then sets off, so it is seen arriving.
        // The jump there lands before the fade's timing is set, or it would
        // glide there from wherever it was first drawn.
        place(at, 0)
        el.getBoundingClientRect()
        el.style.transitionDuration = `${FADE_MS}ms`
        el.style.opacity = '1'
        shown = true
        await Promise.race([new Promise((r) => setTimeout(r, FADE_MS)), pace.hurried])
      }
      const ms = glideMs(Math.hypot(to.x - at.x, to.y - at.y))
      place(to, ms)
      let timer = 0
      await Promise.race([new Promise((r) => (timer = window.setTimeout(r, ms))), pace.hurried])
      window.clearTimeout(timer)
      if (pace.instant()) hide()
    },
    press(pace, on) {
      if (pace.instant() || !shown) return
      const ring = document.createElement('span')
      ring.className = TOUR.pointerPress
      el.appendChild(ring)
      const grow = ring.animate(
        [
          { transform: 'scale(0.4)', opacity: 0.9 },
          { transform: 'scale(1.6)', opacity: 0 },
        ],
        { duration: PRESS_MS, easing: 'ease-out' },
      )
      grow.onfinish = () => ring.remove()
      // A ring left over a control that took the place of the pressed one
      // reads as a press on that one, so it goes with what it pressed.
      if (!on) return
      const was = on.getBoundingClientRect()
      const watch = () => {
        if (!ring.isConnected) return
        const now = on.getBoundingClientRect()
        const moved = Math.abs(now.left - was.left) + Math.abs(now.top - was.top) + Math.abs(now.width - was.width) > 1
        if (!on.isConnected || moved || now.width === 0) {
          grow.cancel()
          ring.remove()
        } else requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    },
    hide,
    remove() {
      el.remove()
    },
  }
}
