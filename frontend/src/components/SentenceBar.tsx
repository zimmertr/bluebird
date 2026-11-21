import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { MenuButton } from './Menu'
import PanelFooter from './PanelFooter'
import type { PanelSection } from './ControlPanel'
import { type AutoAnalyzeStep, autoAnalyzeStep } from '../utils/analyzeGate'
import { MAP_CHIP_SUMMARY_TEXT, SENTENCE_BAR } from '../styles'
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
}

/**
 * The map's sentence bar at a desk (record 0308): one line that says what a
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
}: Props) {
  const toggle = (section: PanelSection) => onCard(card === section ? null : section)
  // The message list's width: the chips and the button, as one span.
  const groupRef = useRef<HTMLDivElement>(null)

  // The panel ran this while it was mounted for good; the cards are not.
  const autoFiredRef = useRef(false)
  const gateOpen = footer.analyzeEnabled
  useEffect(() => {
    const step = autoAnalyzeStep({
      requested: autoAnalyze,
      capabilitiesSettled,
      gateOpen,
      fired: autoFiredRef.current,
    })
    if (step === 'wait') return
    autoFiredRef.current = true
    onAutoAnalyze(step)
  }, [autoAnalyze, capabilitiesSettled, gateOpen, onAutoAnalyze])

  return (
    // One card holding the name, the sentence and the button (record 0313).
    <div className={SENTENCE_BAR.row}>
      {/* The product's name, which the panel's header carried, and the
          page's one heading: the bar leads with it as the prototype did. */}
      <div className={SENTENCE_BAR.brand}>
        <img src={logoUrl} alt="" width={256} height={256} className={SENTENCE_BAR.logo} />
        <h1 className={SENTENCE_BAR.name}>Bluebird Forecast</h1>
      </div>
      <div ref={groupRef} role="group" aria-label="Forecast" className={SENTENCE_BAR.group}>
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
        {/* Limits until they stand with the results, where the prototype
            keeps everything free to change. */}
        <MenuButton shape="slot" data-card="metrics" open={card === 'metrics'} onClick={() => toggle('metrics')}>
          Limits
        </MenuButton>
        <PanelFooter {...footer} bar={{ label, widthRef: groupRef, quiet: label === UP_TO_DATE }} />
      </div>
      {trail}
    </div>
  )
}
