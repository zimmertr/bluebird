import { type KeyboardEvent, type RefObject, type SyntheticEvent, useEffect, useId, useRef } from 'react'
import { IconClose } from '../components/icons'
import { TOUR } from '../styles'
import { TOUR_COPY, TOUR_STEPS, progressText, sectionFill } from '../utils/tourSteps'
import type { CardPlace } from './place'

// The tutorial's card (#536): where in the app the step is, what it does, and
// the way on. It stands where `place.ts` puts it and stays there, and it is as
// tall at every step: each step's text is laid in the same grid cell with only
// the current one visible, so the tallest of them sets the height.

export type Phase = 'loading' | 'read' | 'acting' | 'hold'

export interface CardProps {
  index: number
  phase: Phase
  place: CardPlace
  /** Changes whenever the card should take focus back onto Next. */
  focusKey: number
  cardRef: RefObject<HTMLDivElement | null>
  onNext: () => void
  onPrevious: () => void
  onEnd: () => void
}

// A press on the card is not a press outside a panel the demo opened: the
// demo's pickers close on a press anywhere else in the document.
const keep = (e: SyntheticEvent) => e.stopPropagation()

export default function Card({ index, phase, place, focusKey, cardRef, onNext, onPrevious, onEnd }: CardProps) {
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  const titleId = useId()
  const textId = useId()
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true })
  }, [focusKey])

  // Tab stays on the card while the tutorial runs, as in any modal dialog.
  function trap(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    if (buttons.length === 0) return
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const to = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : at === buttons.length - 1 ? 0 : at + 1
    e.preventDefault()
    buttons[to].focus()
  }

  const edge = place.edge === 'top' ? TOUR.cardTop : place.edge === 'bottom' ? TOUR.cardBottom : ''
  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={textId}
      data-tour-card=""
      data-step={step.key}
      data-phase={phase}
      className={`${TOUR.card} ${edge}`}
      style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
      onKeyDown={trap}
      onPointerDown={keep}
      onMouseDown={keep}
    >
      <div className={TOUR.rail} aria-hidden="true">
        {sectionFill(step).map((fill, i) => (
          <span key={i} className={TOUR.bar}>
            <span className={TOUR.barFill} style={{ width: `${fill * 100}%` }} />
          </span>
        ))}
      </div>
      <div className={TOUR.head}>
        <h2 id={titleId} className={TOUR.section}>
          {step.section}
        </h2>
        {/* Only in a section of more than one step, whose "1 of 1" would read
            as the length of the whole tutorial. */}
        {step.sectionSize > 1 && <span className={TOUR.count}>{progressText(step)}</span>}
        <button type="button" onClick={onEnd} aria-label={TOUR_COPY.close} className={TOUR.close}>
          <IconClose />
        </button>
      </div>
      <div id={textId} className={TOUR.text}>
        {TOUR_STEPS.map((s, i) => (
          <p key={s.key} className={`${TOUR.textLine}${i === index ? '' : ' invisible'}`} aria-hidden={i !== index || undefined}>
            {s.text}
          </p>
        ))}
      </div>
      <div className={TOUR.foot}>
        <button type="button" onClick={onPrevious} disabled={index === 0} className={TOUR.previous}>
          {TOUR_COPY.previous}
        </button>
        <button ref={nextRef} type="button" onClick={onNext} className={TOUR.next}>
          {last ? TOUR_COPY.done : TOUR_COPY.next}
        </button>
      </div>
    </div>
  )
}
