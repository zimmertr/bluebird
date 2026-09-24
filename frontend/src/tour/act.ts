import type { SandboxHandle } from '../hooks/useTour'
import type { Pointer } from './pointer'

// The hands the tutorial acts with (#536): finding a control in the demo copy
// of the app, moving the pointer to it, and pressing, typing or clicking the
// map the way a reader would. Every event goes to the demo app's real
// controls, so the demo exercises the same handlers a reader's input does.

/** Thrown out of an action whose step the reader has already left. */
export class Stale extends Error {}

/** What a step's action is handed. */
export interface Stage {
  /** The demo app's container. */
  root: HTMLElement
  /** The reader's own app, which a lookup must never reach into. */
  readerRoot: HTMLElement | null
  handle(): SandboxHandle
  /** False once the reader has moved on, or ended the tutorial. */
  alive(): boolean
  /** Motion is unwelcome: the pointer jumps and pauses are skipped. */
  reduced: boolean
  pointer: Pointer
  /** Light these elements, as one box, from now until the next call. */
  light(targets: () => (Element | null | undefined)[]): void
}

export function check(stage: Stage): void {
  if (!stage.alive()) throw new Stale()
}

export async function sleep(stage: Stage, ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, stage.reduced ? 0 : ms))
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

/** A button or link under `scope` by its visible words. */
export function byText<E extends HTMLElement = HTMLButtonElement>(
  scope: ParentNode | null,
  selector: string,
  text: string,
): E | null {
  if (!scope) return null
  for (const el of scope.querySelectorAll<E>(selector)) {
    if (el.textContent?.trim() === text) return el
  }
  return null
}

export function centerOf(el: Element): { x: number; y: number } {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** Moves the pointer onto `el` and clicks it. */
export async function press(stage: Stage, el: HTMLElement): Promise<void> {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await stage.pointer.glide(centerOf(el))
  check(stage)
  stage.pointer.press()
  el.click()
  await sleep(stage, 250)
}

// React tracks a field's value itself, so a value set through the element's
// own property is invisible to it. The prototype's setter is the one it does
// not intercept, and the `input` event is what its onChange listens for.
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Types `text` into `el` a character at a time. */
export async function type(stage: Stage, el: HTMLInputElement, text: string): Promise<void> {
  await stage.pointer.glide(centerOf(el))
  stage.pointer.press()
  if (stage.reduced) {
    setValue(el, text)
    return
  }
  for (let i = 1; i <= text.length; i++) {
    setValue(el, text.slice(0, i))
    await sleep(stage, 70)
  }
}

export function key(el: Element, name: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
}

/**
 * Clicks the demo map at a point on screen. MapLibre reads a click from the
 * press and release around it, and drops one that moved, so all three go to
 * the canvas at the same point.
 */
export async function clickMap(stage: Stage, at: { x: number; y: number }): Promise<void> {
  const canvas = find<HTMLCanvasElement>(stage, '[data-tour="map"] canvas')
  if (!canvas) throw new Error('The demo map has no canvas.')
  await stage.pointer.glide(at)
  check(stage)
  stage.pointer.press()
  const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 }
  canvas.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }))
  canvas.dispatchEvent(new MouseEvent('mouseup', init))
  canvas.dispatchEvent(new MouseEvent('click', init))
  await sleep(stage, 250)
}

/** Resolves when the demo map has stopped moving and drawn its tiles. */
export async function mapSettled(stage: Stage): Promise<void> {
  const map = await until(stage, () => stage.handle().map)
  await map.whenIdle()
  check(stage)
}
