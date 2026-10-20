import { useLayoutEffect, useRef } from 'react'
import { MAP_CORNER } from '../styles'
import type { CornerSlots } from '../map/controls'

interface Props {
  /** Receives the corner's slots once it mounts, and null when it goes. */
  onSlots: (slots: CornerSlots | null) => void
}

/**
 * A desk's map corner (record 0174), laid out as Google Maps lays out its own
 * (TJ, 2026-10-20): the credit line flush in the bottom-right corner with the
 * scale at its end, and over it a column of the compass, the locate button and
 * the zoom pair. Empty slots, each handed to `MapView`, which stands the
 * library's own control in it (`placeControl`), so every button keeps the
 * library's states and its permission prompt. A phone has no corner: its
 * compass and locate button stand in its rows (`MapRows`).
 *
 * Reported together, once, because the five mount and go together, so the map
 * moves its controls in and out of the corner in one pass.
 */
export default function MapCorner({ onSlots }: Props) {
  const compass = useRef<HTMLDivElement>(null)
  const locate = useRef<HTMLDivElement>(null)
  const zoom = useRef<HTMLDivElement>(null)
  const credit = useRef<HTMLDivElement>(null)
  const scale = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    onSlots({
      compass: compass.current!,
      locate: locate.current!,
      zoom: zoom.current!,
      credit: credit.current!,
      scale: scale.current!,
    })
    return () => onSlots(null)
  }, [onSlots])

  return (
    <div className={MAP_CORNER.box}>
      {/* A popup keeps clear of the column and the line, as it does of the
          rows, rather than of the box, which is mostly map. */}
      <div data-map-overlay="" className={MAP_CORNER.stack}>
        <div ref={compass} className={MAP_CORNER.slot} />
        <div ref={locate} className={MAP_CORNER.slot} />
        <div ref={zoom} className={MAP_CORNER.slot} />
      </div>
      <div data-map-overlay="" className={MAP_CORNER.credit}>
        <div ref={credit} className={MAP_CORNER.slot} />
        <div ref={scale} className={MAP_CORNER.scale} />
      </div>
    </div>
  )
}
