import { useCallback, useEffect, useRef, useState } from 'react'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useSheetOpen } from '../hooks/useSheetOpen'
import { DISABLED, MAP_FAB, MAP_FAB_WORDS, MAP_NOTICE_BAND } from '../styles'
import { ACTION_WORDS, type ActionWord } from '../utils/analyzeGate'

interface PhoneFootProps {
  /** Where the band's bottom edge stands, over the credit line on the sheet's edge (`noticeBottomPx`). */
  bandBottomPx: number
  /** Where the button's bottom edge stands (`fabBottomPx`), which `MapStage` works out from the band's height. */
  fabBottomPx: number
  /** Receives the band the panel portals its notice block into (record 0140). */
  onNoticeBand: (band: HTMLDivElement | null) => void
  /** Receives the band's height each time it changes, 0 while it holds nothing. */
  onBandPx: (px: number) => void
  /** The panel's Analyze gate (`analyzeGateFor`), which the button shares. */
  analyzeEnabled: boolean
  /** What the button reads (#736, `actionWord`), the same word as the panel's. */
  word: ActionWord
  /** The panel's Analyze command itself, never a second path to it. */
  onAnalyze: () => void
}

/**
 * The foot of a phone's map (#696): the band the panel's notices stand in
 * while the drawer is shut (record 0140), and the Analyze button at the
 * bottom right (record 0135), Material's extended floating action button.
 *
 * The results sheet moves the button, whose top edge it rides, and so does
 * the band, above which it rises while the band holds a notice, and the
 * credit line, above which it rises while the credits are open (record
 * 0174). This component measures the band and hands its height up, and
 * `MapStage` places the band over the line and the button from all three
 * (`noticeBottomPx`, `fabBottomPx`), so the player that stands on the button
 * reads the same number. The button hides under the dim
 * while any bottom sheet is open, and comes back when the sheet closes.
 */
export default function PhoneFoot({
  bandBottomPx,
  fabBottomPx,
  onNoticeBand,
  onBandPx,
  analyzeEnabled,
  word,
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
  // up: a box can wrap, be dismissed or gain a line.
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
  // A run disables the button under the finger that pressed it, and the
  // overlay's Cancel holds the focus meanwhile; when the run ends the focus
  // comes back here, as it does to the panel's Analyze (#576).
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  useTakeOrphanedFocus(buttonRef, analyzeEnabled)

  return (
    <>
      <div ref={bandRef} className={MAP_NOTICE_BAND} style={{ bottom: bandBottomPx }} />
      {!sheetOpen && (
        <button
          ref={buttonRef}
          onClick={onAnalyze}
          disabled={!analyzeEnabled}
          className={`${MAP_FAB} ${DISABLED}`}
          style={{ bottom: fabBottomPx }}
          // The tour's Analyze step (#536): a phone's one Analyze is this.
          data-tour="analyze"
        >
          {/* Every word in one cell, so the button is the widest one's width
              whichever it reads; the others are invisible and unread. */}
          <span className={MAP_FAB_WORDS.cell}>
            <span>{word}</span>
            {ACTION_WORDS.filter((w) => w !== word).map((w) => (
              <span key={w} aria-hidden="true" className={MAP_FAB_WORDS.hidden}>
                {w}
              </span>
            ))}
          </span>
        </button>
      )}
    </>
  )
}
