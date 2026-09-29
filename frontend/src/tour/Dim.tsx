import { type SyntheticEvent, useEffect, useRef } from 'react'
import { TOUR, TOUR_DIM, TOUR_HOLE_PAD_PX, TOUR_HOLE_RADIUS_PX, TOUR_HOLE_RING_PX } from '../styles'
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

// A fifth of the way on each frame: about a quarter of a second to settle.
const EASE = 0.2

export default function Dim({ holes, reduced }: DimProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<SVGPathElement>(null)
  const ringRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    let shown: Box[] = []
    let written = ''
    let raf = 0
    const draw = () => {
      const target = holes().map(padded)
      shown =
        reduced || shown.length !== target.length
          ? target
          : target.map((t, i) => {
              const s = shown[i]
              const step = (a: number, b: number) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * EASE)
              return { left: step(s.left, t.left), top: step(s.top, t.top), right: step(s.right, t.right), bottom: step(s.bottom, t.bottom) }
            })
      const rects = shown.map(roundRect).join('')
      const d = `M0 0H${window.innerWidth}V${window.innerHeight}H0Z${rects}`
      if (d !== written) {
        written = d
        fillRef.current?.setAttribute('d', d)
        ringRef.current?.setAttribute('d', rects)
        // What the browser suite reads to hold the card clear of the lit areas.
        rootRef.current?.setAttribute(
          'data-holes',
          JSON.stringify(target.map((b) => [b.left, b.top, b.right, b.bottom].map(Math.round))),
        )
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [holes, reduced])

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
        <path ref={fillRef} className={TOUR.dimFill} fillOpacity={TOUR_DIM} fillRule="evenodd" />
        <path ref={ringRef} className={TOUR.hole} strokeWidth={TOUR_HOLE_RING_PX} />
      </svg>
    </div>
  )
}
