import { describe, expect, it, vi } from 'vitest'

// MapLibre's controls need a DOM. These record what they were built with, and
// carry the few members of the library's markup the module dresses: each
// control's container and the buttons in it, by class. Hoisted, because
// `vi.mock` runs before the imports.
const { fakeElement } = vi.hoisted(() => {
  type Fake = {
    classes: Set<string>
    classList: { add: (...c: string[]) => void; toggle: (c: string, on: boolean) => void; remove: (c: string) => void }
    buttons: Fake[]
    querySelectorAll: (selector: string) => Fake[]
    querySelector: (selector: string) => Fake | null
  }
  const fakeElement = (...initial: string[]): Fake => {
    const classes = new Set(initial)
    const el: Fake = {
      classes,
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        toggle: (c, on) => void (on ? classes.add(c) : classes.delete(c)),
        remove: (c) => void classes.delete(c),
      },
      buttons: [],
      querySelectorAll: (selector) => (selector === 'button' ? el.buttons : []),
      querySelector: (selector) => el.buttons.find((b) => b.classes.has(selector.replace(/^\./, ''))) ?? null,
    }
    return el
  }
  return { fakeElement }
})
vi.mock('maplibre-gl', () => {
  class Control {
    _container = fakeElement()
    constructor(public options: Record<string, unknown> = { customAttribution: 'MapLibre' }) {}
  }
  return {
    AttributionControl: class extends Control {
      _compactButton = fakeElement('maplibregl-ctrl-attrib-button')
    },
    GeolocateControl: class extends Control {
      constructor(options?: Record<string, unknown>) {
        super(options)
        this._container.buttons = [fakeElement('maplibregl-ctrl-geolocate')]
      }
    },
    NavigationControl: class extends Control {
      constructor(options: Record<string, unknown>) {
        super(options)
        // The library's defaults: both halves of the group unless told not.
        this._container.buttons = [
          ...(options.showZoom === false ? [] : [fakeElement('maplibregl-ctrl-zoom-in'), fakeElement('maplibregl-ctrl-zoom-out')]),
          ...(options.showCompass === false ? [] : [fakeElement('maplibregl-ctrl-compass')]),
        ]
      }
    },
    ScaleControl: class extends Control {},
  }
})

import type * as maplibregl from 'maplibre-gl'
import {
  COMPASS_IDLE_CLASS,
  OPEN_METEO_ATTRIBUTION,
  SCALE_MAX_WIDTH_PX,
  TerrainControl,
  addAttribution,
  addControls,
  placeControl,
  withOpenMeteo,
} from './controls'
import { DISABLED, MAP_CREDIT, MAP_ROUND_BUTTON, MAP_TERRAIN_BUTTON, MAP_ZOOM_PAIR, RADIUS } from '../styles'

type Fake = ReturnType<typeof fakeElement>
const roleOf = (role: string) => role.split(/\s+/).filter(Boolean)

function stub() {
  const added: [string, unknown, string][] = []
  const removed: string[] = []
  const handlers: Record<string, () => void> = {}
  const camera = { bearing: 0, pitch: 0 }
  const canvas = { focus: vi.fn() }
  const map = {
    boxZoom: { disable: vi.fn() },
    addControl: (control: { constructor: { name: string } }, at: string) =>
      added.push([Object.getPrototypeOf(control).constructor.name, control, at]),
    getContainer: () => ({
      querySelector: () => ({ classList: { remove: (c: string) => removed.push(c) } }),
    }),
    getCanvas: () => canvas,
    getBearing: () => camera.bearing,
    getPitch: () => camera.pitch,
    on: (event: string, fn: () => void) => {
      handlers[event] = fn
    },
  }
  return { map: map as unknown as maplibregl.Map, added, removed, boxZoom: map.boxZoom, handlers, camera, canvas }
}

const buttonsOf = (control: unknown) => (control as { _container: Fake })._container.buttons
const DEPS = { onTerrainChange: () => {} }

describe('addControls', () => {
  it('spends shift on pinning rather than box zoom, and puts each control in its corner', () => {
    const { map, added, boxZoom } = stub()
    const { compass, locate, zoom, scale, terrain } = addControls(map, DEPS)
    expect(boxZoom.disable).toHaveBeenCalledTimes(1)
    expect(added.map(([, , at]) => at)).toEqual(['top-right', 'top-right', 'top-right', 'top-right', 'bottom-left'])
    // The five it hands back, for the rows and a desk's corner to stand them in.
    expect(added.map(([, control]) => control)).toEqual([compass, locate, terrain, zoom, scale])
    expect(terrain).toBeInstanceOf(TerrainControl)
  })

  // Two controls where the library would draw one group, so the compass and
  // the zoom pair each stand in a slot of their own (record 0174).
  it('draws the compass and the zoom pair as two controls', () => {
    const { map } = stub()
    const { compass, zoom } = addControls(map, DEPS)
    expect((compass as unknown as { options: Record<string, unknown> }).options).toEqual({ showZoom: false })
    expect((zoom as unknown as { options: Record<string, unknown> }).options).toEqual({ showCompass: false })
    expect(buttonsOf(compass).map((b) => [...b.classes][0])).toEqual(['maplibregl-ctrl-compass'])
    expect(buttonsOf(zoom).map((b) => [...b.classes][0])).toEqual(['maplibregl-ctrl-zoom-in', 'maplibregl-ctrl-zoom-out'])
  })

  // The app's map button on the compass and the locate button (record 0147).
  it('dresses the compass and the locate button in the app\'s round button', () => {
    const { map } = stub()
    const { compass, locate } = addControls(map, DEPS)
    const buttons = [...buttonsOf(compass), ...buttonsOf(locate)]
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      for (const c of roleOf(MAP_ROUND_BUTTON)) expect(button.classes.has(c), c).toBe(true)
    }
  })

  // The zoom pair joined, each half greyed as the idle compass is when the
  // library disables it at either end of the zoom (record 0174).
  it('dresses the zoom pair as one capsule, each half greyed while disabled', () => {
    const { map } = stub()
    const [zoomIn, zoomOut] = buttonsOf(addControls(map, DEPS).zoom)
    for (const [half, role] of [[zoomIn, MAP_ZOOM_PAIR.in], [zoomOut, MAP_ZOOM_PAIR.out]] as const) {
      for (const c of [...roleOf(role), ...roleOf(DISABLED)]) expect(half.classes.has(c), c).toBe(true)
      expect(half.classes.has(RADIUS.pill)).toBe(false)
    }
  })

  // Stated rather than defaulted, because map.css keeps the attribution clear
  // of the scale at this width.
  it('draws the scale no wider than the room map.css keeps for it', () => {
    const { map, added } = stub()
    addControls(map, DEPS)
    const [, scale] = added.find(([, , at]) => at === 'bottom-left')!
    expect((scale as { options: Record<string, unknown> }).options).toEqual({ maxWidth: SCALE_MAX_WIDTH_PX })
  })
})

describe('the compass while north-up', () => {
  const compassOf = (control: unknown) => buttonsOf(control).find((b) => b.classes.has('maplibregl-ctrl-compass'))! as Fake & {
    disabled?: boolean
    ownerDocument?: { activeElement: unknown }
  }

  // On the button itself, since a phone's rows stand it outside the map's
  // container (record 0147). Disabled at both widths: a phone's slot hides
  // it under the class, and a desk's corner greys it by `DISABLED`.
  it('idles the compass while north-up and flat, and wakes it once either moves', () => {
    const { map, handlers, camera } = stub()
    const compass = compassOf(addControls(map, DEPS).compass)
    for (const c of roleOf(DISABLED)) expect(compass.classes.has(c), c).toBe(true)
    expect(Object.keys(handlers).sort()).toEqual(['pitch', 'rotate'])
    const idle = () => [compass.classes.has(COMPASS_IDLE_CLASS), compass.disabled]
    expect(idle()).toEqual([true, true])

    camera.bearing = 12
    handlers.rotate()
    expect(idle()).toEqual([false, false])

    camera.bearing = 0
    handlers.rotate()
    expect(idle()).toEqual([true, true])

    camera.pitch = 30
    handlers.pitch()
    expect(idle()).toEqual([false, false])
  })

  // A press on the compass from the keyboard turns the map north, which
  // disables the button under the keyboard; the map takes it rather than
  // the page.
  it('hands the keyboard to the map when it idles under it', () => {
    const { map, handlers, camera, canvas } = stub()
    const compass = compassOf(addControls(map, DEPS).compass)
    camera.bearing = 12
    handlers.rotate()
    compass.ownerDocument = { activeElement: compass }
    camera.bearing = 0
    handlers.rotate()
    expect(canvas.focus).toHaveBeenCalledOnce()
  })

  // The hiding is map.css's, since the compass is the library's markup;
  // styles.test.ts, which reads that file, holds the rule to this name.
  it('names the class map.css hides a phone\'s compass under', () => {
    expect(COMPASS_IDLE_CLASS).toBe('compass-idle')
  })
})

describe('addAttribution', () => {
  it('keeps the library credit, adds Open-Meteo, decides compact alone, and folds it on add', () => {
    const { map, added, removed } = stub()
    const control = addAttribution(map, true) as unknown as { options: Record<string, unknown> }
    expect(control.options).toEqual({ customAttribution: ['MapLibre', OPEN_METEO_ATTRIBUTION], compact: true })
    // Compact is a phone's, where the credit stands beside the scale (#696).
    expect(added.map(([, , at]) => at)).toEqual(['bottom-left'])
    expect(removed).toEqual(['maplibregl-compact-show'])
  })

  // The app's chrome on the line and its (i) (record 0147), at both widths.
  it('dresses the line as the floating box and its (i) as a round button', () => {
    for (const compact of [true, false]) {
      const { map } = stub()
      const control = addAttribution(map, compact) as unknown as { _container: Fake; _compactButton: Fake }
      for (const c of roleOf(MAP_CREDIT.card)) expect(control._container.classes.has(c), c).toBe(true)
      for (const c of roleOf(MAP_CREDIT.button)) expect(control._compactButton.classes.has(c), c).toBe(true)
    }
  })

  // The same line at a desk, spelled out rather than folded.
  it('carries the Open-Meteo credit spelled out as well as compact', () => {
    const { map, added } = stub()
    const control = addAttribution(map, false) as unknown as { options: { customAttribution: string[] } }
    expect(control.options.customAttribution).toContain(OPEN_METEO_ATTRIBUTION)
    expect(added.map(([, , at]) => at)).toEqual(['bottom-right'])
  })
})

// The library's own controls, moved rather than rebuilt (#696): into a
// phone's slots at the right of its rows or a desk's corner, and back to the
// library corner each was added in, the compass first in the top right.
describe('placeControl', () => {
  // No DOM in this project, so the boxes are the few members the move reads:
  // where a control stands, and an append and a prepend that move it.
  type Box = {
    parentElement: Box | null
    children: Box[]
    appendChild: (child: Box) => void
    prepend: (child: Box) => void
  }
  const box = (): Box => {
    const b: Box = {
      parentElement: null,
      children: [],
      appendChild: (child) => {
        child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1)
        child.parentElement = b
        b.children.push(child)
      },
      prepend: (child) => {
        child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1)
        child.parentElement = b
        b.children.unshift(child)
      },
    }
    return b
  }
  const mapWith = (corners: Record<string, Box>, selectors: string[]) =>
    ({
      getContainer: () => ({
        querySelector: (selector: string) => {
          selectors.push(selector)
          return corners[selector] ?? null
        },
      }),
    }) as unknown as maplibregl.Map
  const control = (element: Box) => ({ _container: element as unknown as HTMLElement })

  it('stands each control in its slot and back in the corner, in its place there', () => {
    const corner = box()
    const locateSlot = box()
    const compassSlot = box()
    const compassEl = box()
    const locateEl = box()
    corner.appendChild(compassEl)
    corner.appendChild(locateEl)
    const selectors: string[] = []
    const map = mapWith({ '.maplibregl-ctrl-top-right': corner }, selectors)
    placeControl(map, control(locateEl), locateSlot as unknown as HTMLElement)
    placeControl(map, control(compassEl), compassSlot as unknown as HTMLElement, { first: true })
    expect(locateEl.parentElement).toBe(locateSlot)
    expect(compassEl.parentElement).toBe(compassSlot)
    placeControl(map, control(locateEl), null)
    placeControl(map, control(compassEl), null, { first: true })
    expect(corner.children).toEqual([compassEl, locateEl])
    expect(selectors).toEqual(['.maplibregl-ctrl-top-right', '.maplibregl-ctrl-top-right'])
  })

  // The scale and the attribution have bottom corners of their own, which a
  // desk's corner takes them out of and gives them back to.
  it('puts a control back in the corner it is named', () => {
    const bottomLeft = box()
    const slot = box()
    const scaleEl = box()
    bottomLeft.appendChild(scaleEl)
    const selectors: string[] = []
    const map = mapWith({ '.maplibregl-ctrl-bottom-left': bottomLeft }, selectors)
    placeControl(map, control(scaleEl), slot as unknown as HTMLElement, { corner: 'bottom-left' })
    expect(scaleEl.parentElement).toBe(slot)
    placeControl(map, control(scaleEl), null, { corner: 'bottom-left' })
    expect(scaleEl.parentElement).toBe(bottomLeft)
    expect(selectors).toEqual(['.maplibregl-ctrl-bottom-left'])
  })
})

// The Open-Meteo credit is a standing member of the attribution line (#687),
// the existing link with no words added, after whatever the library credits.
describe('the Open-Meteo credit on the attribution line', () => {
  const links = (html: string) => html.match(/<a\b[^>]*>[^<]*<\/a>/g) ?? []

  it('is the bare link to Open-Meteo, opening in a new tab', () => {
    expect(links(OPEN_METEO_ATTRIBUTION)).toHaveLength(1)
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/href="https:\/\/open-meteo\.com\/"/)
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/target="_blank"/)
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/rel="noopener noreferrer"/)
    // The whole string is the one link and its words, read off the raw string
    // rather than by stripping tags, which is no way to read HTML.
    expect(OPEN_METEO_ATTRIBUTION).toMatch(/^<a [^<>]*>Open-Meteo\.com<\/a>$/)
  })

  it('joins the library credit once, after it, whatever shape it comes in', () => {
    const line = (custom: string | string[] | undefined) => withOpenMeteo(custom).join(' | ')
    for (const custom of ['MapLibre', ['MapLibre'], undefined]) {
      const credits = withOpenMeteo(custom)
      expect(credits[credits.length - 1]).toBe(OPEN_METEO_ATTRIBUTION)
      expect(line(custom).split('Open-Meteo.com')).toHaveLength(2)
    }
    expect(withOpenMeteo('MapLibre')).toEqual(['MapLibre', OPEN_METEO_ATTRIBUTION])
  })
})

// The 3D button is the app's own markup, so it is built here against a
// document that records what the control made of it.
describe('the 3D button', () => {
  type El = {
    tag: string
    className: string
    type?: string
    textContent: string | null
    attrs: Record<string, string>
    classes: Set<string>
    children: El[]
    listeners: Record<string, () => void>
    removed: boolean
    classList: { add: (...c: string[]) => void }
    setAttribute: (name: string, value: string) => void
    getAttribute: (name: string) => string | null
    hasAttribute: (name: string) => boolean
    addEventListener: (type: string, fn: () => void) => void
    appendChild: (child: El) => void
    remove: () => void
  }
  const element = (tag: string): El => {
    const el: El = {
      tag,
      className: '',
      textContent: null,
      attrs: {},
      classes: new Set(),
      children: [],
      listeners: {},
      removed: false,
      classList: { add: (...c) => c.forEach((x) => el.classes.add(x)) },
      setAttribute: (name, value) => void (el.attrs[name] = value),
      getAttribute: (name) => el.attrs[name] ?? null,
      hasAttribute: (name) => name in el.attrs,
      addEventListener: (type, fn) => void (el.listeners[type] = fn),
      appendChild: (child) => void el.children.push(child),
      remove: () => void (el.removed = true),
    }
    return el
  }
  const mapWithDocument = () =>
    ({ getContainer: () => ({ ownerDocument: { createElement: element } }) }) as unknown as maplibregl.Map

  function added(onChange = vi.fn()) {
    const control = new TerrainControl(onChange)
    const container = control.onAdd(mapWithDocument()) as unknown as El
    return { control, container, button: container.children[0], onChange }
  }

  it('is a button reading 3D, named 3D terrain, in the library\'s group', () => {
    const { container, button } = added()
    expect(container.className).toBe('maplibregl-ctrl maplibregl-ctrl-group')
    expect(container.children).toHaveLength(1)
    expect([button.tag, button.type, button.textContent]).toEqual(['button', 'button', '3D'])
    expect(button.getAttribute('aria-label')).toBe('3D terrain')
    for (const c of roleOf(MAP_TERRAIN_BUTTON)) expect(button.classes.has(c), c).toBe(true)
  })

  // The library gives its own buttons a title; this one carries none, since
  // a tooltip does not exist on touch (record 0064).
  it('carries no title', () => {
    expect(added().button.hasAttribute('title')).toBe(false)
  })

  // The switch is the overlays', so a press asks for the other state and the
  // map hands the answer back.
  it('asks for the other state on a press, and shows the state it is handed', () => {
    const { control, button, onChange } = added()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    button.listeners.click()
    expect(onChange).toHaveBeenLastCalledWith(true)
    // Nothing changes until the state comes back.
    expect(button.getAttribute('aria-pressed')).toBe('false')
    control.setPressed(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    button.listeners.click()
    expect(onChange).toHaveBeenLastCalledWith(false)
    control.setPressed(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  // A link that opens with 3D on presses the button before the map adds it.
  it('shows a state handed to it before it was added', () => {
    const control = new TerrainControl(() => {})
    control.setPressed(true)
    const container = control.onAdd(mapWithDocument()) as unknown as El
    expect(container.children[0].getAttribute('aria-pressed')).toBe('true')
  })

  it('takes its markup with it when removed', () => {
    const { control, container } = added()
    control.onRemove()
    expect(container.removed).toBe(true)
  })
})
