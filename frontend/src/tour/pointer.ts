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
  press(pace: PointerPace): void
  hide(): void
  remove(): void
}

const PRESS_MS = 450
const FADE_MS = 200

// An arrow with its tip at (2, 2), drawn in a 24-unit box.
const ARROW =
  '<path d="M2 2 L2 19 L6.5 14.8 L9.6 21.6 L12.6 20.3 L9.6 13.6 L15.6 13.4 Z" ' +
  'stroke-width="1.5" stroke-linejoin="round" />'

/** How long a glide over `px` takes: longer for further, inside the pace's bounds. */
export function glideMs(px: number): number {
  return Math.round(Math.min(PACE.glideMaxMs, Math.max(PACE.glideMinMs, PACE.glideMinMs + px * 0.5)))
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
        place(at, 0)
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
    press(pace) {
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
    },
    hide,
    remove() {
      el.remove()
    },
  }
}
