import { useEffect, useLayoutEffect, useRef } from 'react'
import { MAP_CORNER } from '../styles'
import { CREDITS_OPEN_CLASS, type CornerSlots } from '../map/controls'
import type { PhoneLine } from '../utils/resultsSheet'

interface Props {
  /** Receives the corner's slots once it mounts, and null when it goes. */
  onSlots: (slots: CornerSlots | null) => void
  /** A phone's corner: the credit line alone, in the map's bottom-left corner. */
  phone?: boolean
  /**
   * Receives a phone's line each time its height or its open state changes,
   * since the notice band and the Analyze button stand over it (`PhoneLine`).
   */
  onLine?: (line: PhoneLine) => void
}

/**
 * A map's corner (record 0174), laid out as Google Maps lays out its own (TJ,
 * 2026-10-20). At a desk, the credit line flush in the bottom-right corner
 * with the scale at its end, and over it a column of the compass, the locate
 * button and the zoom pair. On a phone, the same line flush in the
 * bottom-left corner, holding the (i) and the scale, since the Analyze button
 * stands at the right; its compass and locate button stand in its rows
 * (`MapRows`). Empty slots, each handed to `MapView`, which stands the
 * library's own control in it (`placeControl`), so every control keeps the
 * library's states and its permission prompt.
 *
 * Reported together, once, because they mount and go together, so the map
 * moves its controls in and out of the corner in one pass. A phone's line is
 * also measured, because what stands over it moves with it: the line is
 * `PHONE_LINE_PX` folded and as tall as the credits make it open, and the
 * map's foot reads both from here rather than adding them up.
 */
export default function MapCorner({ onSlots, phone = false, onLine }: Props) {
  const compass = useRef<HTMLDivElement>(null)
  const locate = useRef<HTMLDivElement>(null)
  const zoom = useRef<HTMLDivElement>(null)
  const credit = useRef<HTMLDivElement>(null)
  const scale = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    onSlots({
      credit: credit.current!,
      scale: scale.current!,
      buttons: phone ? null : { compass: compass.current!, locate: locate.current!, zoom: zoom.current! },
    })
    return () => onSlots(null)
  }, [onSlots, phone])

  // Observed rather than worked out, since the opened credits wrap to the
  // phone's width and face. The library opens and folds them by a class on
  // its own markup, and either changes the line's size, so the observer hears
  // both.
  useEffect(() => {
    const el = line.current
    if (!phone || !onLine || !el) return
    let last: PhoneLine | null = null
    const report = () => {
      const now = {
        px: Math.round(el.getBoundingClientRect().height),
        open: el.querySelector(`.${CREDITS_OPEN_CLASS}`) !== null,
      }
      if (last && last.px === now.px && last.open === now.open) return
      last = now
      onLine(now)
    }
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [phone, onLine])

  if (phone) {
    return (
      <div className={MAP_CORNER.phoneBox}>
        {/* A popup keeps clear of the line rather than of the box, which is
            mostly map. */}
        <div ref={line} data-map-overlay="" className={MAP_CORNER.phoneCredit}>
          <div ref={credit} className={MAP_CORNER.slot} />
          <div ref={scale} className={MAP_CORNER.phoneScale} />
        </div>
      </div>
    )
  }
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
