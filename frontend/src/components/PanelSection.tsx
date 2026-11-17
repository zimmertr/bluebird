import { useId, type ReactNode } from 'react'
import { IconFold } from './icons'
import { CARD_SECTION, TEXT } from '../styles'
import type { PanelSectionId } from '../utils/controlsSummary'

/** A section in a desk's card: whether it is open, and the press that opens or collapses it. */
export interface SectionFold {
  open: boolean
  onToggle: () => void
}

interface PanelSectionProps {
  /** The tutorial's anchor (`tourSteps.ts`), spelled at the call site so the anchors test finds it. */
  'data-tour': PanelSectionId
  title: string
  /** A desk's card (record 0305). Absent on a phone, whose sheet shows every section whole. */
  fold?: SectionFold
  /** What the section is set to, in one line, which the card shows while it is collapsed. */
  summary: string
  children: ReactNode
}

/**
 * One of the controls' three sections under its heading. On a phone that is
 * the heading and the controls, as it always was. In a desk's card (#825;
 * record 0305) the heading is a button that opens the section and collapses
 * it again, and a collapsed section shows one line saying what it is set to.
 * The controls stay mounted while collapsed, hidden, so a field keeps what
 * was typed in it and a menu its state.
 */
export default function PanelSection({ 'data-tour': anchor, title, fold, summary, children }: PanelSectionProps) {
  const bodyId = useId()
  if (fold === undefined) {
    return (
      <section data-tour={anchor}>
        <h2 className={`${TEXT.section} mb-2.5`}>{title}</h2>
        {children}
      </section>
    )
  }
  return (
    <section data-tour={anchor}>
      <h2>
        <button
          type="button"
          aria-expanded={fold.open}
          aria-controls={bodyId}
          onClick={fold.onToggle}
          className={CARD_SECTION.head}
        >
          <span className={TEXT.section}>{title}</span>
          {/* The space is the button's name's: a flex row draws none, and
              without it a screen reader runs the two together. */}
          {!fold.open && ' '}
          {!fold.open && <span className={CARD_SECTION.summary}>{summary}</span>}
          <IconFold open={fold.open} className={CARD_SECTION.fold} />
        </button>
      </h2>
      <div id={bodyId} className={fold.open ? CARD_SECTION.body : 'hidden'}>
        {children}
      </div>
    </section>
  )
}
