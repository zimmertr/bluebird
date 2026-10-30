import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import Menu, { MenuButton, MenuSelect } from './Menu'
import { usePopover } from '../hooks/usePopover'
import { placeAt, render, type Box } from '../testSupport/render'
import { ACCENT, MENU, MENU_CHEVRON, MENU_TRIGGER, SURFACE_CHIP_CARD } from '../styles'
import { CHIP_MENU_GAP_PX } from '../utils/results/resultsSheet'

// The one menu every desk control opens (#714; record 0201): `usePopover`
// decides where the card goes and what closes it, `Menu` draws the card and
// portals it out, `MenuButton` is the trigger in its three shapes and
// `MenuSelect` the list that stands in for a native select. Every menu in the
// app is built from these, so a harness that wires them the way the menus do
// covers the behavior they share. What each adds is its own suite's business.

// jsdom's viewport, which the placement reads through `window.innerWidth` and
// `window.innerHeight`.
const VIEWPORT_W = window.innerWidth
const VIEWPORT_H = window.innerHeight

function Harness({ trigger, row, panel }: { trigger: Box; row?: Box; panel?: Box }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const { popoverRef, box, closing } = usePopover({
    open,
    onOpenChange: setOpen,
    triggerRef,
    widthRef: row ? rowRef : undefined,
  })
  const button = (
    <MenuButton
      ref={(el) => {
        triggerRef.current = el
        if (el) placeAt(el, trigger)
      }}
      shape="bar"
      open={open}
      onClick={() => setOpen(!open)}
    >
      Trigger
    </MenuButton>
  )
  return (
    <>
      <div
        ref={(el) => {
          rowRef.current = el
          if (el && row) placeAt(el, row)
        }}
      />
      {panel ? (
        <div
          data-menu-bound=""
          ref={(el) => {
            if (el) placeAt(el, panel)
          }}
        >
          {button}
        </div>
      ) : (
        button
      )}
      <button>Elsewhere</button>
      {box && (
        <Menu box={box} popoverRef={popoverRef} closing={closing}>
          <button>Inside</button>
          <button disabled>Unusable</button>
          <button>Last</button>
        </Menu>
      )}
    </>
  )
}

/** The card: the element the portal puts under the body, holding the rows. */
function card(): HTMLElement {
  const el = screen.getByRole('button', { name: 'Inside' }).closest<HTMLElement>('[style]')
  if (!el) throw new Error('no card on screen')
  return el
}

const trigger = () => screen.getByRole('button', { name: 'Trigger' })

// The card's natural size, which the second measuring pass reads. jsdom lays
// nothing out, so without these every card measures zero and always fits.
let cardHeight = 200
let cardWidth = 0
beforeEach(() => {
  cardHeight = 200
  cardWidth = 0
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => cardHeight)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => cardWidth)
})
afterEach(() => vi.restoreAllMocks())

describe('placement', () => {
  const TRIGGER = { left: 20, top: 100, width: 120, height: 30 }

  // The Layers chip's gap, which every menu takes.
  it('stands 4px under a trigger with room under it', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    expect(CHIP_MENU_GAP_PX).toBe(4)
    expect(card().style.top).toBe(`${100 + 30 + CHIP_MENU_GAP_PX}px`)
    expect(card().style.bottom).toBe('')
    expect(card().dataset.side).toBe('below')
  })

  it('opens above a trigger with no room under it', async () => {
    const { user } = render(<Harness trigger={{ ...TRIGGER, top: VIEWPORT_H - 60 }} />)
    await user.click(trigger())
    expect(card().style.bottom).toBe(`${60 + 4}px`)
    expect(card().style.top).toBe('')
    expect(card().dataset.side).toBe('above')
  })

  it('portals the card out of the tree it is declared in, on the chip card', async () => {
    const { user, container } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    // Out of the scrolling column, which is the reason the box is fixed.
    expect(container.contains(card())).toBe(false)
    expect(card().parentElement).toBe(document.body)
    expect(card().style.position).toBe('fixed')
    expect(card().className).toBe(MENU.card)
    expect(MENU.card).toContain(SURFACE_CHIP_CARD.menu)
  })
})

// At least as wide as its trigger, otherwise as wide as its rows, lined up
// with the trigger's left edge, or its right edge where the left would run off
// its panel or the window.
describe('width', () => {
  it("is its rows' width and never narrower than the trigger", async () => {
    cardWidth = 240
    const { user } = render(<Harness trigger={{ left: 20, top: 100, width: 120, height: 30 }} />)
    await user.click(trigger())
    expect(card().style.width).toBe('max-content')
    expect(card().style.minWidth).toBe('120px')
    expect(card().style.left).toBe('20px')
    expect(card().style.right).toBe('')
  })

  it("lines up with the trigger's right edge where its rows would run off the window", async () => {
    cardWidth = 300
    const left = VIEWPORT_W - 150
    const { user } = render(<Harness trigger={{ left, top: 100, width: 120, height: 30 }} />)
    await user.click(trigger())
    expect(card().style.left).toBe('')
    expect(card().style.right).toBe(`${VIEWPORT_W - (left + 120)}px`)
  })

  it('keeps inside the panel its trigger stands in', async () => {
    cardWidth = 200
    const { user } = render(
      <Harness trigger={{ left: 225, top: 100, width: 118, height: 30 }} panel={{ left: 0, top: 0, width: 360, height: 800 }} />,
    )
    await user.click(trigger())
    expect(card().style.right).toBe(`${VIEWPORT_W - 343}px`)
  })

  it('takes a width it is given, whatever its rows want', async () => {
    cardWidth = 900
    const { user } = render(
      <Harness
        trigger={{ left: 225, top: 100, width: 118, height: 30 }}
        row={{ left: 16, top: 100, width: 327, height: 30 }}
        panel={{ left: 0, top: 0, width: 360, height: 800 }}
      />,
    )
    await user.click(trigger())
    expect(card().style.width).toBe('327px')
    expect(card().style.right).toBe(`${VIEWPORT_W - 343}px`)
  })
})

describe('dismissal', () => {
  const TRIGGER = { left: 20, top: 100, width: 120, height: 30 }

  it('closes on Escape and hands focus back to the trigger', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    screen.getByRole('button', { name: 'Inside' }).focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a press outside the card', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
  })

  it('stays open on a press inside the card', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }))
    expect(screen.getByRole('button', { name: 'Inside' })).toBeTruthy()
  })

  it('leaves the trigger its own toggle rather than closing and reopening', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    // A full click: the pointerdown must not dismiss first, or the click would
    // reopen what the press had just closed.
    await user.click(trigger())
    expect(screen.queryByRole('button', { name: 'Inside' })).toBeNull()
  })
})

// A card leaves the way it came in (`MOTION.menu`), so it stays mounted for
// its own transition after a close. jsdom has no stylesheet, which is why
// every other suite here sees a close as gone at once; these give the card the
// transition a browser would compute for it.
describe('the exit', () => {
  const TRIGGER = { left: 20, top: 100, width: 120, height: 30 }
  const inside = () => screen.queryByRole('button', { name: 'Inside' })

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function openWith(transition: { property: string; duration: string }) {
    render(<Harness trigger={TRIGGER} />)
    fireEvent.click(trigger())
    card().style.transitionProperty = transition.property
    card().style.transitionDuration = transition.duration
  }
  const MENU_TRANSITION = { property: 'opacity, translate', duration: '0.15s' }

  it('stays for its 150ms closing, then goes', () => {
    openWith(MENU_TRANSITION)
    fireEvent.pointerDown(document.body)
    expect(card().dataset.state).toBe('closing')
    act(() => vi.advanceTimersByTime(149))
    expect(inside()).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(inside()).toBeNull()
  })

  // Everything but the picture is closed from the first frame.
  it('reads as shut while it goes, with the keyboard back on the trigger', () => {
    openWith(MENU_TRANSITION)
    inside()!.focus()
    fireEvent.pointerDown(document.body)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })

  it('turns round where it stands on a reopen during the exit', () => {
    openWith(MENU_TRANSITION)
    const going = card()
    fireEvent.pointerDown(document.body)
    act(() => vi.advanceTimersByTime(60))
    fireEvent.click(trigger())
    expect(card()).toBe(going)
    expect(card().dataset.state).toBe('open')
    act(() => vi.advanceTimersByTime(500))
    expect(inside()).not.toBeNull()
  })

  // `motion-reduce:transition-none`, as a browser computes it.
  it('goes at once where the reader asked for less motion', () => {
    openWith({ property: 'none', duration: '0.15s' })
    fireEvent.pointerDown(document.body)
    expect(inside()).toBeNull()
  })
})

// Every card is portalled to the end of the body, so the keyboard has to be
// carried in and out of it: left on the trigger, a reader reached the Columns
// rows only after every link in the results table (#576).
describe('focus', () => {
  const TRIGGER = { left: 20, top: 100, width: 120, height: 30 }
  const inside = (name: string) => screen.queryByRole('button', { name })

  it('moves the keyboard to the first control when the card opens', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    expect(document.activeElement).toBe(inside('Inside'))
  })

  it('closes on Tab past the last control and hands the keyboard to the trigger', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    await user.tab()
    // The disabled row is not a stop, so Last is the card's far edge.
    expect(document.activeElement).toBe(inside('Last'))
    await user.tab()
    expect(inside('Inside')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on Shift+Tab before the first control and hands the keyboard to the trigger', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    await user.tab({ shift: true })
    expect(inside('Inside')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('hands the keyboard back when the card closes under it', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    inside('Last')!.focus()
    // A press on nothing that takes focus, as on the map.
    fireEvent.pointerDown(document.body)
    expect(inside('Inside')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('leaves the keyboard where a press elsewhere put it', async () => {
    const { user } = render(<Harness trigger={TRIGGER} />)
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(inside('Inside')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elsewhere' }))
  })
})

// The trigger in its three shapes, with the one chevron, hover and open state.
describe('MenuButton', () => {
  const points = (button: HTMLElement) => button.querySelector('polyline')!.getAttribute('points')

  it('wears its shape and nothing else of its own', () => {
    for (const shape of ['chip', 'field', 'bar'] as const) {
      const { unmount } = render(
        <MenuButton shape={shape} open={false}>
          {shape}
        </MenuButton>,
      )
      const button = screen.getByRole('button', { name: shape })
      expect(button.className).toBe(MENU_TRIGGER[shape])
      expect(button.querySelector('svg')!.getAttribute('class')).toContain(MENU_CHEVRON[shape])
      unmount()
    }
  })

  // The hover and the open state are the shape's roles, read here as the
  // classes the shape wears, so a trigger cannot drift to a hover of its own.
  it('lights the label under the pointer, never the edge, and the open state on aria-expanded', () => {
    const words = (classes: string) => classes.split(' ')
    const fill = words(ACCENT.fill).find((t) => t.startsWith('bg-'))!
    const edge = 'border-accent-ink'
    expect(words(MENU_TRIGGER.chip)).toContain(ACCENT.hoverText)
    expect(words(MENU_TRIGGER.field)).toContain(`enabled:${ACCENT.hoverText}`)
    for (const shape of Object.values(MENU_TRIGGER)) expect(shape).not.toMatch(/hover:border/)
    expect(words(MENU_TRIGGER.bar)).toContain(ACCENT.hoverText)
    expect(MENU_TRIGGER.bar).not.toMatch(/hover:border/)
    expect(words(MENU_TRIGGER.chip)).toContain(`aria-expanded:${fill}`)
    expect(words(MENU_TRIGGER.bar)).toContain(`aria-expanded:${fill}`)
    expect(words(MENU_TRIGGER.field)).toContain(`aria-expanded:${edge}`)
    expect(MENU_TRIGGER.field).not.toContain('aria-expanded:bg-')
  })

  it('points its chevron down while shut and up while open', () => {
    const { rerender } = render(
      <MenuButton shape="field" open={false}>
        Field
      </MenuButton>,
    )
    const button = screen.getByRole('button', { name: 'Field' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const shut = points(button)
    rerender(
      <MenuButton shape="field" open>
        Field
      </MenuButton>,
    )
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(points(button)).not.toBe(shut)
  })

  it('draws no chevron where its menu is a sheet', () => {
    render(
      <MenuButton shape="chip" open={false} chevron={false}>
        Chip
      </MenuButton>,
    )
    expect(screen.getByRole('button', { name: 'Chip' }).querySelector('svg')).toBeNull()
  })

  it('places a chevron where it is told to', () => {
    render(
      <MenuButton shape="field" open={false} chevronClassName="first-line">
        Field
      </MenuButton>,
    )
    expect(screen.getByRole('button', { name: 'Field' }).querySelector('svg')!.getAttribute('class')).toContain('first-line')
  })
})

// The list that stands in for a native select at a desk.
describe('MenuSelect', () => {
  const OPTIONS = [
    { value: 'avg', label: 'Avg' },
    { value: 'max', label: 'Max' },
    { value: 'min', label: 'Min' },
  ] as const

  function Select({ onChange = () => {} }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState<string>('max')
    return (
      <>
        <MenuSelect
          label="Wind aggregate"
          value={value}
          options={OPTIONS}
          onChange={(v) => {
            setValue(v)
            onChange(v)
          }}
          className="w-14"
        />
        <button>Elsewhere</button>
      </>
    )
  }

  const field = () => screen.getByRole('button', { name: /^Wind aggregate/ })
  const list = () => screen.queryByRole('listbox', { name: 'Wind aggregate' })
  const option = (name: string) => screen.getByRole('option', { name })

  // A screen reader hears what the select was called and what it holds.
  it('is a field named by its label and the value it shows', () => {
    render(<Select />)
    expect(field().getAttribute('aria-haspopup')).toBe('listbox')
    expect(field().className).toBe(`${MENU_TRIGGER.field} w-14 text-left`)
    const name = field().getAttribute('aria-labelledby')!.split(' ').map((id) => document.getElementById(id)!.textContent)
    expect(name).toEqual(['Wind aggregate', 'Max'])
  })

  it('opens the one menu, the current value set semibold and no check mark', async () => {
    const { user } = render(<Select />)
    await user.click(field())
    expect(list()).toBeTruthy()
    expect(list()!.closest('[style]')!.className).toBe(MENU.card)
    expect(option('Max').getAttribute('aria-selected')).toBe('true')
    expect(option('Max').className).toContain(MENU.current)
    expect(option('Avg').className).not.toContain(MENU.current)
    for (const row of screen.getAllByRole('option')) {
      expect(row.className).toContain(MENU.option)
      expect(row.querySelector('svg, input')).toBeNull()
    }
    expect(document.activeElement).toBe(list())
  })

  it('fills the row under the pointer', async () => {
    const { user } = render(<Select />)
    await user.click(field())
    fireEvent.pointerEnter(option('Min'))
    expect(option('Min').className).toContain(MENU.active)
    expect(option('Max').className).not.toContain(MENU.active)
  })

  it('picks a row on a click, closes and hands the keyboard back', async () => {
    const onChange = vi.fn()
    const { user } = render(<Select onChange={onChange} />)
    await user.click(field())
    await user.click(option('Min'))
    expect(onChange).toHaveBeenCalledWith('min')
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(field())
    expect(field().textContent).toBe('Wind aggregateMin')
  })

  it('walks the rows with the arrow keys and picks with Enter', async () => {
    const onChange = vi.fn()
    const { user } = render(<Select onChange={onChange} />)
    field().focus()
    await user.keyboard('{ArrowDown}')
    expect(list()).toBeTruthy()
    // Opens on the current value.
    expect(list()!.getAttribute('aria-activedescendant')).toBe(option('Max').id)
    await user.keyboard('{ArrowDown}')
    expect(option('Min').className).toContain(MENU.active)
    await user.keyboard('{ArrowDown}')
    expect(list()!.getAttribute('aria-activedescendant')).toBe(option('Min').id)
    await user.keyboard('{Home}')
    expect(list()!.getAttribute('aria-activedescendant')).toBe(option('Avg').id)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('avg')
    expect(list()).toBeNull()
    expect(document.activeElement).toBe(field())
  })

  it('picks with Space too', async () => {
    const onChange = vi.fn()
    const { user } = render(<Select onChange={onChange} />)
    await user.click(field())
    await user.keyboard('{End}')
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith('min')
  })

  it('closes on Escape with nothing picked and the keyboard on the field', async () => {
    const onChange = vi.fn()
    const { user } = render(<Select onChange={onChange} />)
    await user.click(field())
    await user.keyboard('{ArrowDown}{Escape}')
    expect(list()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field())
  })

  it('closes on Tab and on a press outside', async () => {
    const { user } = render(<Select />)
    await user.click(field())
    await user.tab()
    expect(list()).toBeNull()
    await user.click(field())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(list()).toBeNull()
  })

  it('reports nothing when the current value is picked again', async () => {
    const onChange = vi.fn()
    const { user } = render(<Select onChange={onChange} />)
    await user.click(field())
    await user.click(option('Max'))
    expect(onChange).not.toHaveBeenCalled()
    expect(list()).toBeNull()
  })
})
