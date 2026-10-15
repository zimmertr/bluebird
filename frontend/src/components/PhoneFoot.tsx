import { useCallback, useEffect, useRef, useState } from 'react'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useSheetOpen } from '../hooks/useSheetOpen'
import { DISABLED, MAP_FAB, MAP_FAB_WORDS, MAP_NOTICE_BAND } from '../styles'
import { noticeBottomPx } from '../utils/resultsSheet'

interface PhoneFootProps {
  /** How far the results sheet stands up the map (0 with no sheet). */
  liftPx: number
  /** Where the button's bottom edge stands (`fabBottomPx`), which `MapStage` works out from the band's height. */
  fabBottomPx: number
  /** Receives the band the panel portals its notice block into (record 0140). */
  onNoticeBand: (band: HTMLDivElement | null) => void
  /** Receives the band's height each time it changes, 0 while it holds nothing. */
  onBandPx: (px: number) => void
  /**
   * Receives the button's width when it is measured: the wider word's in the
   * phone's own face, which the opened credit line stops short of (map.css).
   */
  onFabPx: (px: number) => void
  /** The panel's Analyze gate (`analyzeGateFor`), which the button shares. */
  analyzeEnabled: boolean
  /** A run is under way, which the button says as the panel's does. */
  analyzing: boolean
  /** The panel's Analyze command itself, never a second path to it. */
  onAnalyze: () => void
}

/**
 * The foot of a phone's map (#696): the band the panel's notices stand in
 * while the drawer is shut (record 0140), and the Analyze button at the
 * bottom right (record 0135), Material's extended floating action button.
 *
 * Two things move the button and nothing else: the results sheet, whose top
 * edge it rides, and the band, above which it rises while the band holds a
 * notice. This component measures the band and hands its height up, and
 * `MapStage` places the button from it (`fabBottomPx`), so the player that
 * stands on the button reads the same number. The button hides under the dim
 * while any bottom sheet is open, and comes back when the sheet closes.
 */
export default function PhoneFoot({
  liftPx,
  fabBottomPx,
  onNoticeBand,
  onBandPx,
  onFabPx,
  analyzeEnabled,
  analyzing,
  onAnalyze,
}: PhoneFootProps) {
  const [band, setBand] = useState<HTMLDivElement | null>(null)
  const bandRef = useCallback(
    (el: HTMLDivElement | null) => {
      setBand(el)
      onNoticeBand(el)
    },
    [onNoticeBand],
  )
  // The band's height decides where the button stands, and the notices in it
  // come and go with the panel's state, so it is observed rather than added
  // up: a box can wrap, be dismissed or gain a retry.
  useEffect(() => {
    if (!band) return
    const report = () => onBandPx(Math.round(band.getBoundingClientRect().height))
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(band)
    return () => observer.disconnect()
  }, [band, onBandPx])

  const sheetOpen = useSheetOpen()
  // The button's width is the wider word's whichever it reads, so it moves
  // only with the face, the size or the zoom; observed for those, and left
  // standing while a sheet hides the button, since the width it held is the
  // width it comes back at.
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!button) return
    const report = () => onFabPx(button.getBoundingClientRect().width)
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(button)
    return () => observer.disconnect()
  }, [button, onFabPx])
  // A run disables the button under the finger that pressed it, and the
  // overlay's Cancel holds the focus meanwhile; when the run ends the focus
  // comes back here, as it does to the panel's Analyze (#576).
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  useTakeOrphanedFocus(buttonRef, analyzeEnabled)
  const setButtonRef = useCallback((el: HTMLButtonElement | null) => {
    buttonRef.current = el
    setButton(el)
  }, [])

  return (
    <>
      <div ref={bandRef} className={MAP_NOTICE_BAND} style={{ bottom: noticeBottomPx(liftPx) }} />
      {!sheetOpen && (
        <button
          ref={setButtonRef}
          onClick={onAnalyze}
          disabled={!analyzeEnabled}
          className={`${MAP_FAB} ${DISABLED}`}
          style={{ bottom: fabBottomPx }}
          // The tour's Analyze step (#536): a phone's one Analyze is this.
          data-tour="analyze"
        >
          {/* Both words in one cell, so the button is the wider one's width
              whichever it reads; the other is invisible and unread. */}
          <span className={MAP_FAB_WORDS.cell}>
            <span>{analyzing ? 'Analyzing…' : 'Analyze'}</span>
            <span aria-hidden="true" className={MAP_FAB_WORDS.hidden}>
              {analyzing ? 'Analyze' : 'Analyzing…'}
            </span>
          </span>
        </button>
      )}
    </>
  )
}
