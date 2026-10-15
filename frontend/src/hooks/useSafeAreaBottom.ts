import { useEffect, useState } from 'react'
import { SAFE_AREA } from '../styles'

/**
 * The height of the band a phone keeps for its own gestures at the bottom of
 * the screen, the home indicator on an iPhone, in CSS pixels (#336, #696;
 * record 0145). Zero wherever the browser reports none, which is every desk
 * and every page without `viewport-fit=cover`.
 *
 * Read off a probe that wears `SAFE_AREA.probe`, an invisible box as tall as
 * `env(safe-area-inset-bottom)`, because only CSS can read the inset and the
 * phone's foot is placed in pixels: the Analyze button, the notice band and
 * the player measure from the sheet's edge, and before there is a sheet that
 * edge is the top of this band rather than the screen's. Observed, since a
 * rotation changes the inset without a render.
 */
export function useSafeAreaBottom(): number {
  const [px, setPx] = useState(0)
  useEffect(() => {
    const probe = document.createElement('div')
    probe.className = SAFE_AREA.probe
    probe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(probe)
    const read = () => {
      const next = Math.round(probe.getBoundingClientRect().height)
      setPx((prev) => (prev === next ? prev : next))
    }
    read()
    window.addEventListener('resize', read)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    observer?.observe(probe)
    return () => {
      window.removeEventListener('resize', read)
      observer?.disconnect()
      probe.remove()
    }
  }, [])
  return px
}
