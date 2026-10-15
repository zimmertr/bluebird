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
import { prefersReducedMotion } from '../utils/motion'
import { anchorSelector, type TourStep } from '../utils/tourSteps'
import { scrollParent } from './useTour'
import {
  type Box,
  cardMode,
  clipAbove,
  cornerRadius,
  placeCard,
  sameBox,
  scrollBlock,
  scrollTopFor,
  sectionBox,
  sheetBetween,
  sheetEdge,
  spotlight,
  spotPad,
  spotRadius,
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

/** The root's attribute while a tour runs, which hides every scroll shadow (`index.css`). */
const TOURING_ATTR = 'data-touring'

/** How long after a step change the spotlight and the card animate, unless a scroll ends it sooner. */
const MOTION_MS = 250

/**
 * How many frames in a row the target must hold still before the overlay
 * stops measuring it every frame (#696). Ten frames, a sixth of a second,
 * outlast the gap between two frames of a drawer's slide or a map's settle.
 */
const SETTLE_FRAMES = 10

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
 * and a popup riding a map that is still settling. The loop runs from a step
 * change, a scroll or a resize until the target has stood still for
 * `SETTLE_FRAMES`, or for as long as it has yet to appear, and then stops
 * (#696): it ran every frame for the whole tour, reading every target's box
 * and corners sixty times a second over a page with nothing moving. A pass
 * that measures the same boxes sets nothing. The motion role is worn only for the moment after
 * a step changes, and not while the panel scrolls to the step's control;
 * always on, it made the spotlight trail its control by 200 ms whenever
 * the layout moved for another reason.
 */
export default function Tour({ steps, index, onNext, onPrev, onEnd }: Props) {
  const step = steps[index]
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()
  const [target, setTarget] = useState<Box | null>(null)
  // The radius the target's corners are drawn at (`cornerRadius`), which
  // decides the light's pad and its corners.
  const [targetRadius, setTargetRadius] = useState(0)
  // The target's own box and the top of a framed surface standing below it,
  // where the step opened one there (a phone's Layers sheet): the band a
  // sheet-mode card stands in, between the two, rather than over either.
  const [opened, setOpened] = useState<{ own: Box; floor: number } | null>(null)
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
    const anchors = [step.anchor, ...(step.frames ?? [])]
    const whole = unionBox(anchors.map(boxOf))
    const corners = anchors.flatMap((anchor) => {
      const el = document.querySelector(anchorSelector(anchor))
      if (!el) return []
      const c = getComputedStyle(el)
      return [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius]
    })
    const radius = cornerRadius(corners)
    // A target that runs under another surface is lit only where it shows;
    // the pad is kept out of that surface too.
    const over = step.under ? rect(document.querySelector(anchorSelector(step.under))) : null
    const box = whole && over ? clipAbove(whole, over.top - spotPad(step.spot, radius)) : whole
    setTarget((prev) => (sameBox(prev, box) ? prev : box))
    setTargetRadius(radius)
    const own = boxOf(step.anchor)
    const floors = (step.frames ?? [])
      .map(boxOf)
      .filter((b): b is Box => b !== null && own !== null && b.top >= own.top + own.height)
      .map((b) => b.top)
    const next = own && floors.length > 0 ? { own, floor: Math.min(...floors) } : null
    setOpened((prev) =>
      prev && next && sameBox(prev.own, next.own) && prev.floor === next.floor ? prev : next,
    )
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
    return box
  }, [step.anchor, step.frames, step.spot, step.under])

  // Before every paint: a render that changed a shape is placed by the new
  // shape, not the old one. Converges because a pass that changes nothing
  // sets nothing.
  useLayoutEffect(() => {
    measure()
  })

  // Bring the control into the panel's view, then follow it: on the events
  // the page is told about, and once a frame for the moves it is not. The
  // panel's own scroller is the one box moved, and only by what the target
  // needs (`scrollTopFor`): `scrollIntoView` scrolls every ancestor that
  // can, and the app's root can whenever a positioned descendant stretches
  // its overflow, so each step pushed a 101-row report's page further up
  // and the end of the tour left it there (2026-10-06).
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(anchorSelector(step.anchor))
    const scroller = scrollParent(el)
    if (el && scroller) {
      const box = (r: DOMRect): Box => ({ top: r.top, left: r.left, width: r.width, height: r.height })
      const top = scrollTopFor(
        scrollBlock(step.spot),
        box(el.getBoundingClientRect()),
        box(scroller.getBoundingClientRect()),
        scroller.scrollTop,
      )
      if (top !== scroller.scrollTop) scroller.scrollTo({ top, behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
    }
    // Followed a frame at a time until it settles, and woken again by any
    // scroll or resize; a target still on its way keeps the loop going.
    let frame = 0
    let still = 0
    let last: Box | null = null
    const follow = () => {
      const box = measure()
      still = box !== null && sameBox(box, last) ? still + 1 : 0
      last = box
      frame = box !== null && still >= SETTLE_FRAMES ? 0 : requestAnimationFrame(follow)
    }
    const wake = () => {
      measure()
      still = 0
      if (frame === 0) frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    window.addEventListener('resize', wake)
    document.addEventListener('scroll', wake, true)
    return () => {
      window.removeEventListener('resize', wake)
      document.removeEventListener('scroll', wake, true)
      cancelAnimationFrame(frame)
    }
  }, [step.anchor, step.spot, measure])

  // Focus lands on Next at every step, so Enter walks the tour and a screen
  // reader hears the new card; the motion role is worn for the move and shed.
  // The panel scrolls smoothly to a control it has to reach, so the reader
  // sees where the next section stands rather than a jump, and the first
  // scroll event sheds the motion role early: the spotlight then rides the
  // section up the panel frame by frame. Under a transition it would not,
  // because a transition restarted every frame stands still (measured: it
  // held its old place for the whole 330 ms scroll and moved after it).
  useEffect(() => {
    // `preventScroll`, because a focus call scrolls every scrollable ancestor
    // to the focused element the way `scrollIntoView` does.
    nextRef.current?.focus({ preventScroll: true })
    setMoving(true)
    const timer = window.setTimeout(() => setMoving(false), MOTION_MS)
    const shed = () => setMoving(false)
    document.addEventListener('scroll', shed, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('scroll', shed, true)
    }
  }, [index])

  // Tab cycles inside the card; Escape ends it; the arrow keys step either
  // way, and Backspace and Delete step back, because a Mac keyboard labels
  // its one key Delete and a reader who tried it expected a step back (TJ,
  // 2026-09-29). Enter and Space on a focused button are the button's own,
  // or Previous would step back and then forward.
  // The scroll shadows stand down while the tour runs (#696): a shade is a
  // sticky strip over the scroller's own content, so the spotlight's hole
  // showed it lying across the top of the section it lit (the Forecast step,
  // on a phone's Controls sheet). The hole lights what is there, and a shade
  // that says "more above" says nothing a reader being shown one control can
  // use. One attribute on the root, which `index.css` reads.
  useEffect(() => {
    document.documentElement.setAttribute(TOURING_ATTR, '')
    return () => document.documentElement.removeAttribute(TOURING_ATTR)
  }, [])

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
      if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'Delete') {
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
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const pad = spotPad(step.spot, targetRadius)
  const light = target ? spotlight(target, pad) : null
  const sheet = cardMode(viewport.width) === 'sheet'
  if (light && !sheet) lastAt.current = placeCard(light, cardSize, viewport)
  const at = sheet ? null : lastAt.current
  // Between the target and the surface it opened below it, where the band
  // holds the card; along an edge otherwise.
  const betweenTop =
    sheet && opened ? sheetBetween(spotlight(opened.own, pad), opened.floor, cardSize.height) : null
  const sheetRole =
    betweenTop !== null || sheetEdge(light, cardSize.height, viewport.height) === 'top' ? TOUR.sheetTop : TOUR.sheet
  const motion = moving ? ` ${TOUR.motion}` : ''
  const last = index === steps.length - 1
  // With no target yet, the dim still covers the screen: a spotlight of no
  // size at the centre is a dim with no hole in it.
  const hole = light ?? { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 }

  return (
    <div className={`fixed inset-0 ${LAYER.modal} overflow-hidden`}>
      <div
        className={`${TOUR.spotlight}${motion}`}
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          // Measured off the target rather than a role, since the light
          // follows whatever it frames: the target's radius plus the pad.
          borderRadius: spotRadius(targetRadius, pad),
        }}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        data-tour-card=""
        className={`${sheet ? sheetRole : TOUR.card}${motion}`}
        style={at ? { top: at.top, left: at.left } : betweenTop !== null ? { top: betweenTop } : undefined}
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

