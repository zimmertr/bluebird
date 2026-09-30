import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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
import {
  type Box,
  cardMode,
  placeCard,
  sameBox,
  sectionBox,
  sheetEdge,
  SPOTLIGHT_PAD,
  spotlight,
  unionBox,
} from './place'

interface Props {
  steps: readonly TourStep[]
  /** Index into `steps`. */
  index: number
  onNext: () => void
  onPrev: () => void
  onEnd: () => void
}

/** How long after a step change the spotlight and the card animate. */
const MOTION_MS = 250

/**
 * The tutorial overlay (#536): a spotlight over the current step's control
 * and one card that says what it does. It points and never acts: nothing is
 * clicked, fetched or typed on the reader's behalf.
 *
 * Measurement runs three ways, and each exists for a case the others miss.
 * A layout effect after EVERY render measures before the paint, so a render
 * that changed the card's shape (a sheet becoming a box as the window widens)
 * never paints a placement computed from the old shape: that was a card
 * standing below its section for as long as a window drag lasted, because
 * Chrome pauses animation frames during the drag. Resize and scroll
 * listeners cover the moves the page is told about. An animation-frame loop
 * covers the ones it is not: the phone's drawer sliding in for a panel step,
 * and a popup riding a map that is still settling. A pass that measures the
 * same boxes sets nothing. The motion role is worn only for the moment after
 * a step changes; always on, it made the spotlight trail its control by
 * 200 ms whenever the layout moved for another reason.
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
  const [moving, setMoving] = useState(false)
  // Where the card last stood, kept for the frames a step's target has yet
  // to appear in (a popup on its way), so the card holds still rather than
  // falling back to an unplaced box.
  const lastAt = useRef<{ top: number; left: number } | null>(null)

  const measure = useCallback(() => {
    const rect = (el: Element | null): Box | null => {
      const r = el?.getBoundingClientRect()
      return r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
    }
    const boxOf = (anchor: string): Box | null => {
      const el = document.querySelector<HTMLElement>(anchorSelector(anchor))
      const own = rect(el)
      if (!el || !own || step.spot !== 'section' || !el.parentElement) return own
      return sectionBox(own, rect(el.previousElementSibling), rect(el.nextElementSibling), rect(el.parentElement)!)
    }
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
  }, [step.anchor, step.frames, step.spot])

  // Before every paint: a render that changed a shape is placed by the new
  // shape, not the old one. Converges because a pass that changes nothing
  // sets nothing.
  useLayoutEffect(() => {
    measure()
  })

  // Bring the control into the panel's view, then follow it: on the events
  // the page is told about, and once a frame for the moves it is not.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(anchorSelector(step.anchor))
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    window.addEventListener('resize', measure)
    document.addEventListener('scroll', measure, true)
    let frame = 0
    const tick = () => {
      measure()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', measure, true)
      cancelAnimationFrame(frame)
    }
  }, [step.anchor, measure])

  // Focus lands on Next at every step, so Enter walks the tour and a screen
  // reader hears the new card; the motion role is worn for the move and shed.
  useEffect(() => {
    nextRef.current?.focus()
    setMoving(true)
    const timer = window.setTimeout(() => setMoving(false), MOTION_MS)
    return () => window.clearTimeout(timer)
  }, [index])

  // Tab cycles inside the card; Escape ends it; the arrow keys step either
  // way. Enter and Space on a focused button are the button's own, or
  // Previous would step back and then forward.
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

  const light = target ? spotlight(target, step.spot === 'control' ? SPOTLIGHT_PAD : 0) : null
  const sheet = cardMode(viewport.width) === 'sheet'
  if (light && !sheet) lastAt.current = placeCard(light, cardSize, viewport)
  const at = sheet ? null : lastAt.current
  const sheetRole = sheetEdge(light, cardSize.height, viewport.height) === 'top' ? TOUR.sheetTop : TOUR.sheet
  const motion = moving ? ` ${TOUR.motion}` : ''
  const last = index === steps.length - 1
  // With no target yet, the dim still covers the screen: a spotlight of no
  // size at the centre is a dim with no hole in it.
  const hole = light ?? { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 }

  return (
    <div className={`fixed inset-0 ${LAYER.modal} overflow-hidden`}>
      <div
        className={`${TOUR.spotlight}${motion}`}
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        className={`${sheet ? sheetRole : TOUR.card}${motion}`}
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
