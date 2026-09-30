/**
 * Whether the reader asked the system for less motion. One place to read the
 * media query, so a scroll or a transition that a component decides to make
 * smooth asks the same question the stylesheet's `motion-reduce:` variant
 * answers. MapLibre's own camera moves need no such check: a `flyTo` or
 * `panBy` that is not marked `essential` already jumps under this setting.
 *
 * False wherever there is no window or no `matchMedia` (the node suite, an
 * old browser), because "no preference stated" is the setting's own default.
 */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  )
}
