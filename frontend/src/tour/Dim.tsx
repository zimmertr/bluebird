import { type SyntheticEvent, useEffect, useId, useRef } from 'react'
import { TOUR, TOUR_DIM, TOUR_HOLE_PAD_PX, TOUR_HOLE_RADIUS_PX, TOUR_HOLE_RING_PX, TOUR_PULSE_MS } from '../styles'
import type { Box } from './place'

// The dim over the demo copy of the app (#536), with each lit area cut out of
// it and ringed. It also takes every press, so the reader watches the demo
// rather than working it. The lit areas follow their targets every frame (a
// panel opens, the map flies), and glide from one step's to the next's where
// motion is welcome, the count of them staying the same.

export interface DimProps {
  /** The boxes to light now, as the run measures them. */
  holes: () => Box[]
  reduced: boolean
  /** Changes as each card opens, and the ring pulses once. */
  pulse: number
}

const keep = (e: SyntheticEvent) => e.stopPropagation()

function padded(b: Box): Box {
  return {
    left: b.left - TOUR_HOLE_PAD_PX,
    top: b.top - TOUR_HOLE_PAD_PX,
    right: b.right + TOUR_HOLE_PAD_PX,
    bottom: b.bottom + TOUR_HOLE_PAD_PX,
  }
}

function roundRect({ left, top, right, bottom }: Box): string {
  const r = Math.min(TOUR_HOLE_RADIUS_PX, (right - left) / 2, (bottom - top) / 2)
  return (
    `M${left + r} ${top}H${right - r}A${r} ${r} 0 0 1 ${right} ${top + r}` +
    `V${bottom - r}A${r} ${r} 0 0 1 ${right - r} ${bottom}` +
    `H${left + r}A${r} ${r} 0 0 1 ${left} ${bottom - r}` +
    `V${top + r}A${r} ${r} 0 0 1 ${left + r} ${top}Z`
  )
}

// How fast a lit area glides to its target: it closes all but e^-1 of the
// distance in this many milliseconds, so it has settled to a pixel within a
// third of a second. Timed by the wall clock rather than by the frame or its
// timestamp, so a slow machine, which draws few frames and may stamp each one
// as if it came on time, still lands the light on time.
const GLIDE_TAU_MS = 55

export default function Dim({ holes, reduced, pulse }: DimProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<SVGPathElement>(null)
  const ringRef = useRef<SVGPathElement>(null)
  // Only letters and digits, so it reads the same inside `url(#…)`.
  const maskId = `tour-dim${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    let shown: Box[] = []
    let written = ''
    let raf = 0
    let last = performance.now()
    const draw = () => {
      const now = performance.now()
      const share = 1 - Math.exp(-Math.max(0, now - last) / GLIDE_TAU_MS)
      last = now
      const target = holes().map(padded)
      shown =
        reduced || shown.length !== target.length
          ? target
          : target.map((t, i) => {
              const s = shown[i]
              const step = (a: number, b: number) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * share)
              return { left: step(s.left, t.left), top: step(s.top, t.top), right: step(s.right, t.right), bottom: step(s.bottom, t.bottom) }
            })
      const rects = shown.map(roundRect).join('')
      if (rects !== written) {
        written = rects
        fillRef.current?.setAttribute('d', rects)
        ringRef.current?.setAttribute('d', rects)
        // What the browser suite reads: the lit areas as drawn, not as aimed
        // at, so a light still on its way from the last step shows as one.
        rootRef.current?.setAttribute(
          'data-holes',
          JSON.stringify(
            shown.map((b) =>
              [b.left + TOUR_HOLE_PAD_PX, b.top + TOUR_HOLE_PAD_PX, b.right - TOUR_HOLE_PAD_PX, b.bottom - TOUR_HOLE_PAD_PX].map(Math.round),
            ),
          ),
        )
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [holes, reduced])

  // Once as each card opens, so the eye finds a light that stands far from
  // the card. The class is taken off and put back to play it again.
  useEffect(() => {
    const ring = ringRef.current
    if (!ring || pulse === 0) return
    ring.classList.remove(TOUR.pulse)
    ring.getBoundingClientRect()
    ring.classList.add(TOUR.pulse)
    const done = window.setTimeout(() => ring.classList.remove(TOUR.pulse), TOUR_PULSE_MS)
    return () => window.clearTimeout(done)
  }, [pulse])

  return (
    <div
      ref={rootRef}
      data-tour-dim=""
      aria-hidden="true"
      className={TOUR.dim}
      onPointerDown={keep}
      onMouseDown={keep}
      onClick={keep}
      onWheel={keep}
    >
      <svg className="h-full w-full">
        {/* The lit areas are cut out through a mask rather than as holes in
            one path, so two that overlap stay lit where they meet. */}
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <path ref={fillRef} fill="black" />
        </mask>
        <rect width="100%" height="100%" className={TOUR.dimFill} fillOpacity={TOUR_DIM} mask={`url(#${maskId})`} />
        <path ref={ringRef} className={TOUR.hole} strokeWidth={TOUR_HOLE_RING_PX} />
      </svg>
    </div>
  )
}
