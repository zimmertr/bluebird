import { useEffect, useId, useRef, useState } from 'react'
import { IconClose } from '../components/icons'
import {
  BUTTON_ACCENT,
  BUTTON_SECONDARY,
  ICON_BUTTON,
  LAYER,
  PROSE,
  TEXT,
  TOUR,
} from '../styles'
import { anchorSelector, type TourStep } from '../utils/tourSteps'
import { type Box, cardMode, placeCard, sameBox, spotlight, unionBox } from './place'

interface Props {
  steps: readonly TourStep[]
  /** Index into `steps`. */
  index: number
  onNext: () => void
  onPrev: () => void
  onEnd: () => void
}

/**
 * The tutorial overlay (#536): a spotlight over the current step's control
 * and one card that says what it does. It points and never acts: nothing is
 * clicked, fetched or typed on the reader's behalf, so it runs the same over
 * an empty app and over a committed report.
 *
 * The target is re-measured every animation frame while the tour is open,
 * rather than on resize and scroll events, because the thing that moves it
 * most is the phone's drawer sliding in for a panel step, and that is a CSS
 * transition no event names. A frame that measures the same box sets nothing.
 */
export default function Tour({ steps, index, onNext, onPrev, onEnd }: Props) {
  const step = steps[index]
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()
  const [target, setTarget] = useState<Box | null>(null)
  const [cardSize, setCardSize] = useState({ width: 320, height: 160 })
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

  // Bring the control into the panel's view, then follow it frame by frame.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(anchorSelector(step.anchor))
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    let frame = 0
    const boxOf = (anchor: string): Box | null => {
      const r = document.querySelector<HTMLElement>(anchorSelector(anchor))?.getBoundingClientRect()
      return r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
    }
    const measure = () => {
      const box = unionBox([boxOf(step.anchor), ...(step.frames ?? []).map(boxOf)])
      setTarget((prev) => (sameBox(prev, box) ? prev : box))
      const card = cardRef.current?.getBoundingClientRect()
      if (card) {
        setCardSize((prev) =>
          prev.width === card.width && prev.height === card.height
            ? prev
            : { width: card.width, height: card.height },
        )
      }
      setViewport((prev) =>
        prev.width === window.innerWidth && prev.height === window.innerHeight
          ? prev
          : { width: window.innerWidth, height: window.innerHeight },
      )
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [step.anchor, step.frames])

  // Focus lands on Next at every step, so Enter walks the tour and a screen
  // reader hears the new card. Tab cycles inside the card; Escape ends it;
  // the arrow keys step either way. Enter and Space on a focused button are
  // the button's own, or Previous would step back and then forward.
  useEffect(() => {
    nextRef.current?.focus()
  }, [index])
  const handlers = useRef({ onNext, onPrev, onEnd })
  handlers.current = { onNext, onPrev, onEnd }
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const card = cardRef.current
      if (e.key === 'Escape') {
        e.stopPropagation()
        handlers.current.onEnd()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handlers.current.onNext()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlers.current.onPrev()
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const active = document.activeElement
        if (active?.tagName === 'BUTTON' && card?.contains(active)) return
        e.preventDefault()
        handlers.current.onNext()
        return
      }
      if (e.key !== 'Tab' || !card) return
      const focusables = card.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const light = target ? spotlight(target) : null
  const sheet = cardMode(viewport.width) === 'sheet'
  const at = light && !sheet ? placeCard(light, cardSize, viewport) : null
  const last = index === steps.length - 1

  return (
    <div className={`fixed inset-0 ${LAYER.modal} overflow-hidden`}>
      {light && (
        <div
          className={TOUR.spotlight}
          style={{ top: light.top, left: light.left, width: light.width, height: light.height }}
          aria-hidden="true"
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        className={sheet ? TOUR.sheet : TOUR.card}
        style={at ? { top: at.top, left: at.left } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className={PROSE.heading}>{step.title}</h2>
          <button type="button" onClick={onEnd} aria-label="End tutorial" className={ICON_BUTTON}>
            <IconClose />
          </button>
        </div>
        <p id={textId} className={PROSE.body}>{step.text}</p>
        <div className="flex items-center justify-between gap-2">
          <span className={TEXT.caption}>{`${index + 1} of ${steps.length}`}</span>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={onPrev} className={BUTTON_SECONDARY}>
                Previous
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={last ? onEnd : onNext}
              className={BUTTON_ACCENT}
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
