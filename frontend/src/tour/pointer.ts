import { TOUR } from '../styles'

// The drawn pointer the tutorial acts with (#536). It glides to a control,
// sends a ring out from its tip on a press, and is hidden on steps that only
// point. Its tip is the element's own top-left corner, so a translate to a
// point puts the tip on it.

export interface Pointer {
  glide(to: { x: number; y: number }): Promise<void>
  press(): void
  hide(): void
  remove(): void
}

const GLIDE_MIN_MS = 250
const GLIDE_MAX_MS = 700
const PRESS_MS = 450

// An arrow with its tip at (2, 2), drawn in a 24-unit box.
const ARROW =
  '<path d="M2 2 L2 19 L6.5 14.8 L9.6 21.6 L12.6 20.3 L9.6 13.6 L15.6 13.4 Z" ' +
  'stroke-width="1.5" stroke-linejoin="round" />'

export function createPointer(reduced: boolean): Pointer {
  const el = document.createElement('div')
  el.className = TOUR.pointer
  el.setAttribute('aria-hidden', 'true')
  el.style.opacity = '0'
  el.innerHTML = `<svg viewBox="0 0 24 24" class="${TOUR.pointerArrow}" style="margin:-2px 0 0 -2px">${ARROW}</svg>`
  document.body.appendChild(el)
  // It first enters from the lower right of the screen, where no control sits.
  let at = { x: window.innerWidth * 0.75, y: window.innerHeight * 0.8 }
  el.style.transform = `translate(${at.x}px, ${at.y}px)`

  return {
    glide(to) {
      const shown = el.style.opacity === '1'
      const ms = reduced || !shown
        ? 0
        : Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, Math.hypot(to.x - at.x, to.y - at.y) * 0.9))
      el.style.transitionDuration = `${ms}ms`
      el.style.opacity = '1'
      el.style.transform = `translate(${to.x}px, ${to.y}px)`
      at = to
      return new Promise((resolve) => setTimeout(resolve, ms))
    },
    press() {
      if (reduced) return
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
    hide() {
      el.style.transitionDuration = '0ms'
      el.style.opacity = '0'
    },
    remove() {
      el.remove()
    },
  }
}
