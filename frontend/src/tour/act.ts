import type { SandboxHandle } from '../hooks/useTour'
import type { Box } from './place'
import type { Pointer } from './pointer'

// The hands the tutorial acts with (#536): finding a control in the demo copy
// of the app, moving the pointer to it, and pressing, typing or clicking the
// map the way a reader would. Every event goes to the demo app's real
// controls, so the demo exercises the same handlers a reader's input does.

/** Thrown out of an action whose step the reader has already left. */
export class Stale extends Error {}

/** What a step lights: an element in the demo, or a box of the screen. */
export type Target = Element | Box | null | undefined

/** What a step's action is handed. */
export interface Stage {
  /** The demo app's container. */
  root: HTMLElement
  /** The reader's own app, which a lookup must never reach into. */
  readerRoot: HTMLElement | null
  handle(): SandboxHandle
  /** False once the reader has moved on, or ended the tutorial. */
  alive(): boolean
  /**
   * True while nothing may take time: motion is unwelcome, the reader pressed
   * Next to finish the step, or a press is being played again.
   */
  instant(): boolean
  /** Settles the moment the reader hurries the step, so a wait ends early. */
  hurried: Promise<void>
  pointer: Pointer
  /** Light these, each on its own, from now until the next call. */
  light(targets: () => Target[]): void
  /** The card's box on screen, which a popup is kept clear of. */
  card(): Box | null
  /** The part of the map clear of the card, where a map step acts. */
  freeMap(): Box | null
}

// The pace, where motion is welcome. Slow enough to follow a pointer across
// the screen and see what it pressed before the screen answers.
export const PACE = {
  glideMinMs: 700,
  glideMaxMs: 1100,
  /** Before a press, once the pointer has arrived, and again after it. */
  pressPauseMs: 500,
  typeMs: 110,
  flightMs: 2000,
  /** After a step that finished by itself, before the next card. */
  holdMs: 600,
} as const

export function check(stage: Stage): void {
  if (!stage.alive()) throw new Stale()
}

/** Waits `ms`, or not at all while instant, and ends early when hurried. */
export async function sleep(stage: Stage, ms: number): Promise<void> {
  if (!stage.instant()) {
    let timer = 0
    await Promise.race([
      new Promise((resolve) => (timer = window.setTimeout(resolve, ms))),
      stage.hurried,
    ])
    window.clearTimeout(timer)
  }
  check(stage)
}

/** The next frame, for a commit to land or a layout to settle. */
export async function frame(stage: Stage): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
  check(stage)
}

/** Polls until `get` answers, or fails after `timeoutMs`. */
export async function until<T>(
  stage: Stage,
  get: () => T | null | undefined | false,
  timeoutMs = 8000,
): Promise<T> {
  const deadline = performance.now() + timeoutMs
  for (;;) {
    check(stage)
    const got = get()
    if (got) return got
    if (performance.now() > deadline) throw new Error('The tutorial waited too long for the demo app.')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * The first element matching `selector` in the demo app. Its own tree is
 * searched first; then the page outside the reader's app, where the demo's
 * portaled panels (the model list, a popover) land.
 */
export function find<E extends Element = HTMLElement>(stage: Stage, selector: string): E | null {
  const own = stage.root.querySelector<E>(selector)
  if (own) return own
  for (const el of document.querySelectorAll<E>(selector)) {
    if (!stage.readerRoot?.contains(el)) return el
  }
  return null
}

export function centerOf(el: Element): { x: number; y: number } {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** The nearest ancestor that scrolls, which is the panel for every panel control. */
export function scrollParent(el: Element): HTMLElement | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if ((overflowY === 'auto' || overflowY === 'scroll') && at.scrollHeight > at.clientHeight) return at
  }
  return null
}

/**
 * Scrolls `el`'s scrolling ancestor so all of `el` shows, or, when it is
 * taller than the space, so its top stands at the top. Smooth, unless instant.
 */
export async function reveal(stage: Stage, el: Element, margin = 8): Promise<void> {
  const box = scrollParent(el)
  if (!box) return
  const outer = box.getBoundingClientRect()
  const inner = el.getBoundingClientRect()
  let delta = 0
  if (inner.height > outer.height - 2 * margin || inner.top < outer.top + margin) {
    delta = inner.top - outer.top - margin
  } else if (inner.bottom > outer.bottom - margin) {
    delta = inner.bottom - outer.bottom + margin
  }
  if (Math.abs(delta) < 1) return
  box.scrollTo({ top: box.scrollTop + delta, behavior: stage.instant() ? 'auto' : 'smooth' })
  await sleep(stage, 400)
}

/** Moves the pointer onto `el` and clicks it. */
export async function press(stage: Stage, el: HTMLElement): Promise<void> {
  await reveal(stage, el)
  await stage.pointer.glide(centerOf(el), stage)
  await sleep(stage, PACE.pressPauseMs)
  stage.pointer.press(stage)
  el.click()
  await sleep(stage, PACE.pressPauseMs)
}

// React tracks a field's value itself, so a value set through the element's
// own property is invisible to it. The prototype's setter is the one it does
// not intercept, and the `input` event is what its onChange listens for.
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Moves the pointer onto a field and presses it, ready to type. */
export async function pressField(stage: Stage, el: HTMLElement): Promise<void> {
  await reveal(stage, el)
  await stage.pointer.glide(centerOf(el), stage)
  await sleep(stage, PACE.pressPauseMs)
  stage.pointer.press(stage)
}

/** Types `text` into `el` a character at a time. */
export async function type(stage: Stage, el: HTMLInputElement, text: string): Promise<void> {
  await pressField(stage, el)
  for (let i = 1; i <= text.length; i++) {
    if (stage.instant()) {
      setValue(el, text)
      break
    }
    setValue(el, text.slice(0, i))
    await sleep(stage, PACE.typeMs)
  }
  check(stage)
}

export function key(el: Element, name: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
}

/**
 * Clicks the demo map at a point on screen. MapLibre reads a click from the
 * press and release around it, and drops one that moved, so all three go to
 * the canvas at the same point.
 */
export async function clickMap(stage: Stage, at: { x: number; y: number }, pauseMs: number = PACE.pressPauseMs): Promise<void> {
  const canvas = find<HTMLCanvasElement>(stage, '[data-tour="map"] canvas')
  if (!canvas) throw new Error('The demo map has no canvas.')
  await stage.pointer.glide(at, stage)
  await sleep(stage, pauseMs)
  stage.pointer.press(stage)
  const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 }
  canvas.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }))
  canvas.dispatchEvent(new MouseEvent('mouseup', init))
  canvas.dispatchEvent(new MouseEvent('click', init))
  await sleep(stage, pauseMs)
}

/** Resolves when the demo map has stopped moving and drawn its tiles. */
export async function mapSettled(stage: Stage): Promise<void> {
  const map = await until(stage, () => stage.handle().map)
  await map.whenIdle()
  check(stage)
}

export function boxOf(el: Element): Box {
  const { left, top, right, bottom } = el.getBoundingClientRect()
  return { left, top, right, bottom }
}

/**
 * Pans the map until a popup on it stands inside the part of the map clear of
 * the card and of whatever covers the map's bottom edge, or, where it is taller
 * than that, with its top at the top of it. A popup follows its marker, and
 * MapLibre flips which side of the marker it opens on as the marker moves, so
 * it is measured again after each pan.
 */
export async function fitPopup(stage: Stage, popup: () => Element | null): Promise<void> {
  const map = stage.handle().map
  if (!map) return
  const shift = (low: number, high: number, from: number, to: number) =>
    high - low > to - from || low < from ? from - low : high > to ? to - high : 0
  for (let tries = 0; tries < 3; tries++) {
    const el = popup()
    const free = stage.freeMap()
    if (!el || !free) return
    const pop = boxOf(el)
    const gap = 8
    const dx = shift(pop.left, pop.right, free.left + gap, free.right - gap)
    const dy = shift(pop.top, pop.bottom, free.top, free.bottom - gap)
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
    // A pan moves the map's content the other way.
    map.panBy(-dx, -dy, 500)
    await sleep(stage, 50)
    await mapSettled(stage)
    await frame(stage)
  }
}
