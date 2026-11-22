import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { MenuButton } from './Menu'
import PanelFooter from './PanelFooter'
import type { PanelSection } from './ControlPanel'
import { type AutoAnalyzeStep, autoAnalyzeStep } from '../utils/analyzeGate'
import { MAP_CHIP_SUMMARY_TEXT, SENTENCE_BAR, SR_ONLY } from '../styles'
import { logoUrl } from '../logo'
import { UP_TO_DATE } from '../utils/sentenceBar'

interface Props {
  /** What a Forecast will look for, and where, as two phrases (`wherePhrases`). */
  what: string
  area: string | null
  /** Over which hours (`whenLabel`), and the word before it (`whenWord`). */
  when: string
  whenWord: string | null
  /** The card a chip has open, or null. */
  card: PanelSection | null
  onCard: (card: PanelSection | null) => void
  /** The Forecast button's words (`forecastLabel`). */
  label: string
  /** The Forecast button: the gate, the messages and the press, as the panel's footer took them. */
  footer: Omit<ComponentProps<typeof PanelFooter>, 'bar' | 'phone'>
  /** The one run a link may ask for on open, which the bar runs because it is always mounted. */
  autoAnalyze: boolean
  capabilitiesSettled: boolean
  onAutoAnalyze: (step: Exclude<AutoAnalyzeStep, 'wait'>) => void
  /** What stands after the button: the theme switch, which the panel's header held. */
  trail?: ReactNode
  /**
   * A phone's bar (record 0328): the logo and the phrases on one line, each
   * phrase raising the Controls sheet through `onCard`. The Forecast button
   * is the map's own at its foot, and the sheet runs a link's one Forecast.
   */
  phone?: boolean
}

/**
 * The map's sentence bar at a desk (record 0309): one line that says what a
 * Forecast will search and over which hours, each phrase a chip that opens
 * its section as a card under the bar, then the one button that spends.
 * Everything that changes what is forecast is here; everything that only
 * re-reads a forecast already held is in the results.
 */
export default function SentenceBar({
  what,
  area,
  when,
  whenWord,
  card,
  onCard,
  label,
  footer,
  autoAnalyze,
  capabilitiesSettled,
  onAutoAnalyze,
  trail,
  phone = false,
}: Props) {
  const toggle = (section: PanelSection) => onCard(card === section ? null : section)
  // The message list's width: the chips and the button, as one span.
  const groupRef = useRef<HTMLDivElement>(null)

  // The panel ran this while it was mounted for good; the cards are not.
  const autoFiredRef = useRef(false)
  const gateOpen = footer.analyzeEnabled
  useEffect(() => {
    const step = autoAnalyzeStep({
      requested: autoAnalyze && !phone,
      capabilitiesSettled,
      gateOpen,
      fired: autoFiredRef.current,
    })
    if (step === 'wait') return
    autoFiredRef.current = true
    onAutoAnalyze(step)
  }, [autoAnalyze, capabilitiesSettled, gateOpen, onAutoAnalyze, phone])

  const phrases = (
    <>
      {/* What and where both open the Where card, which holds both. */}
      <MenuButton shape="slot" data-card="destinations" open={card === 'destinations'} onClick={() => toggle('destinations')} className={SENTENCE_BAR.slot}>
        <span className={MAP_CHIP_SUMMARY_TEXT}>{what}</span>
      </MenuButton>
      {area !== null && (
        <>
          <span className={SENTENCE_BAR.word}>in</span>
          <MenuButton shape="slot" data-card="destinations" open={card === 'destinations'} onClick={() => toggle('destinations')} className={SENTENCE_BAR.slot}>
            <span className={MAP_CHIP_SUMMARY_TEXT}>{area}</span>
          </MenuButton>
        </>
      )}
      {whenWord !== null && <span className={SENTENCE_BAR.word}>{whenWord}</span>}
      <MenuButton shape="slot" data-card="forecast" open={card === 'forecast'} onClick={() => toggle('forecast')} className={SENTENCE_BAR.slot}>
        <span className={MAP_CHIP_SUMMARY_TEXT}>{when}</span>
      </MenuButton>
    </>
  )

  // A phone's bar gives the name's width to the phrases, and keeps the page's
  // heading for a screen reader.
  if (phone) {
    return (
      <div className={SENTENCE_BAR.phoneRow}>
        <img src={logoUrl} alt="" width={256} height={256} className={SENTENCE_BAR.phoneLogo} />
        <h1 className={SR_ONLY}>Bluebird Forecast</h1>
        <div role="group" aria-label="Forecast" className={SENTENCE_BAR.phoneGroup}>
          {phrases}
        </div>
      </div>
    )
  }

  return (
    // One card holding the name, the sentence and the button (record 0314).
    <div className={SENTENCE_BAR.row}>
      {/* The product's name, which the panel's header carried, and the
          page's one heading: the bar leads with it as the prototype did. */}
      <div className={SENTENCE_BAR.brand}>
        <img src={logoUrl} alt="" width={256} height={256} className={SENTENCE_BAR.logo} />
        <h1 className={SENTENCE_BAR.name}>Bluebird Forecast</h1>
      </div>
      <div ref={groupRef} role="group" aria-label="Forecast" className={SENTENCE_BAR.group}>
        {phrases}
        <PanelFooter {...footer} bar={{ label, widthRef: groupRef, quiet: label === UP_TO_DATE }} />
      </div>
      {trail}
    </div>
  )
}
