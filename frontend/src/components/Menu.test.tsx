import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import Menu, { MenuBrowse, MenuButton, MenuSelect, type BrowseGroup, type BrowseItem } from './Menu'
import { usePopover } from '../hooks/usePopover'
import { placeAt, render, type Box } from '../testSupport/render'
import { ACCENT, MENU, MENU_BROWSE, MENU_CHEVRON, MENU_TRIGGER, SURFACE_CHIP_CARD } from '../styles'
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
    const words = (classes: string) => classes.split(/\s+/)
    for (const shape of Object.values(MENU_TRIGGER)) expect(words(shape)).toContain(ACCENT.hoverText)
    // One open state for all three: the accent fill under the label-on-fill
    // ink (record 0251).
    for (const shape of Object.values(MENU_TRIGGER)) {
      expect(shape).not.toMatch(/hover:border/)
      for (const part of words(ACCENT.fill)) expect(words(shape)).toContain(`aria-expanded:${part}`)
    }
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
    expect(field().className).toBe(`${MENU_TRIGGER.field} w-14 text-center`)
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

// The menu a reader searches and browses (#848, record 0281): the Coordinate
// list field's, with its lists under regions.
describe('MenuBrowse', () => {
  const GROUPS: readonly BrowseGroup[] = [
    { name: 'Washington', words: [] },
    { name: 'Northern Rockies', words: ['Idaho', 'Montana', 'Wyoming'] },
    // A group with no row is never shown.
    { name: 'Alaska', words: [] },
  ]
  const ITEMS: readonly BrowseItem[] = [
    { id: 'wa-bulger-list', name: 'The Bulger List', description: 'The Bulger hundred.', group: 'Washington', count: 100 },
    { id: 'wa-top-100', name: 'Washington Top 100', description: 'The hundred highest.', group: 'Washington', count: 100 },
    { id: 'wy-13ers', name: 'Wyoming 13ers', description: 'Every Wyoming 13er.', group: 'Northern Rockies', count: 35 },
    { id: 'id-one', name: 'Lone Peak List', description: 'One peak.', group: 'Northern Rockies', count: 1 },
  ]
  const OTHER = { value: ':custom', label: 'Custom coordinates' }

  function Browse({
    initial = '',
    onChange = () => {},
    sheet = false,
    stars = [],
  }: {
    initial?: string
    onChange?: (v: string) => void
    sheet?: boolean
    stars?: readonly string[]
  }) {
    const [value, setValue] = useState(initial)
    const [starred, setStarred] = useState<readonly string[]>(stars)
    const rowRef = useRef<HTMLDivElement>(null)
    return (
      <div ref={rowRef}>
        <MenuBrowse
          label="Coordinate list"
          placeholder="Select a list"
          value={value}
          items={ITEMS}
          groups={GROUPS}
          other={OTHER}
          onChange={(v) => {
            setValue(v)
            onChange(v)
          }}
          starred={starred}
          onToggleStar={(id) => setStarred((held) => (held.includes(id) ? held.filter((x) => x !== id) : [...held, id]))}
          widthRef={rowRef}
          sheet={sheet}
          className="w-40"
        />
        <button>Elsewhere</button>
      </div>
    )
  }

  const field = (reads?: string) =>
    screen.getByRole('button', { name: `Coordinate list ${reads ?? 'Select a list'}` })
  const search = () => screen.getByRole('textbox', { name: 'Search lists' })
  const region = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} \\d+ lists?$`) })
  const pick = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} \\d+ peaks?$`) })
  const noPick = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name} \\d+ peaks?$`) }) === null
  const star = (name: string) => screen.getByRole('button', { name: `Star ${name}` })
  const about = (name: string) => screen.getByRole('button', { name: `About ${name}` })

  // The field reads its placeholder at rest and is named by its label and the
  // placeholder, since a name must hold the words a control shows (WCAG 2.5.3,
  // record 0288), and by its label and its pick after one.
  it('is a field named by its label and what it reads, at rest and after a pick', async () => {
    const { user } = render(<Browse />)
    expect(field().textContent).toContain('Select a list')
    expect(field().getAttribute('aria-haspopup')).toBe('dialog')
    expect(field().className).toBe(`${MENU_TRIGGER.field} w-40 text-center`)
    expect(field().getAttribute('aria-labelledby')!.split(' ')).toHaveLength(2)
    await user.click(field())
    await user.click(region('Washington'))
    await user.click(pick('The Bulger List'))
    expect(field('The Bulger List').getAttribute('aria-labelledby')!.split(' ')).toHaveLength(2)
  })

  // A visible heading can name the field instead (record 0288): the reader
  // then hears the heading and what the field shows.
  it('takes its name from a visible heading when given one', () => {
    render(
      <>
        <h3 id="list-heading">List search</h3>
        <MenuBrowse
          label="Coordinate list"
          placeholder="Select a list"
          labelledBy="list-heading"
          value=""
          items={ITEMS}
          groups={GROUPS}
          other={OTHER}
          onChange={() => {}}
          starred={[]}
          onToggleStar={() => {}}
          widthRef={{ current: null }}
          className="w-40"
        />
      </>,
    )
    expect(screen.getByRole('button', { name: 'List search Select a list' }).textContent).toContain('Select a list')
  })

  it('opens on the search box with every group that holds a row, each shut and counted', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    expect(document.activeElement).toBe(search())
    expect(search().getAttribute('placeholder')).toBe('Search lists')
    expect(region('Washington').getAttribute('aria-expanded')).toBe('false')
    expect(region('Washington').textContent).toBe('Washington 2 lists')
    expect(region('Northern Rockies').textContent).toBe('Northern Rockies 2 lists')
    expect(screen.queryByRole('button', { name: /^Alaska/ })).toBeNull()
    expect(noPick('The Bulger List')).toBe(true)
    // No Starred group until something is starred.
    expect(screen.queryByText('Starred')).toBeNull()
  })

  it('opens one group at a time, in place, each row ending in its count', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    await user.click(region('Washington'))
    expect(region('Washington').getAttribute('aria-expanded')).toBe('true')
    const rows = screen.getByRole('group', { name: 'Washington' })
    expect(region('Washington').getAttribute('aria-controls')).toBe(rows.id)
    expect(rows.className).toBe(MENU_BROWSE.nest)
    expect(pick('The Bulger List').textContent).toBe('The Bulger List 100 peaks')
    await user.click(region('Northern Rockies'))
    expect(region('Washington').getAttribute('aria-expanded')).toBe('false')
    expect(noPick('The Bulger List')).toBe(true)
    // One peak is a peak.
    expect(pick('Lone Peak List').textContent).toBe('Lone Peak List 1 peak')
    await user.click(region('Northern Rockies'))
    expect(noPick('Wyoming 13ers')).toBe(true)
  })

  it('picks a row, closes, and opens next on the picked row\'s group with the row current', async () => {
    const onChange = vi.fn()
    const { user } = render(<Browse onChange={onChange} />)
    await user.click(field())
    await user.click(region('Northern Rockies'))
    await user.click(pick('Wyoming 13ers'))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('wy-13ers')
    expect(screen.queryByRole('textbox', { name: 'Search lists' })).toBeNull()
    await user.click(field('Wyoming 13ers'))
    expect(region('Northern Rockies').getAttribute('aria-expanded')).toBe('true')
    expect(pick('Wyoming 13ers').getAttribute('aria-current')).toBe('true')
    expect(pick('Wyoming 13ers').className).toContain(MENU.current)
    expect(pick('Lone Peak List').getAttribute('aria-current')).toBeNull()
    // The row already held is not picked again.
    await user.click(pick('Wyoming 13ers'))
    expect(onChange).toHaveBeenCalledOnce()
  })

  // A lone heading over rows a reader would have to open every time.
  it('opens the only group there is', async () => {
    const { user } = render(
      <MenuBrowse
        label="Coordinate list"
        placeholder="Select a list"
        value=""
        items={ITEMS.filter((item) => item.group === 'Washington')}
        groups={GROUPS}
        other={OTHER}
        onChange={() => {}}
        starred={[]}
        onToggleStar={() => {}}
        widthRef={{ current: null }}
        className="w-40"
      />,
    )
    await user.click(field())
    expect(region('Washington').getAttribute('aria-expanded')).toBe('true')
    expect(pick('The Bulger List')).toBeTruthy()
  })

  it('ends in the other row under a hairline, and picks it', async () => {
    const onChange = vi.fn()
    const { user } = render(<Browse onChange={onChange} />)
    await user.click(field())
    const other = screen.getByRole('button', { name: 'Custom coordinates' })
    expect(other.className).toBe(`${MENU_BROWSE.other} `)
    const rule = other.previousElementSibling as HTMLElement
    expect(rule.getAttribute('aria-hidden')).toBe('true')
    expect(rule.className).toBe(MENU.divider)
    await user.click(other)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(':custom')
    expect(field('Custom coordinates')).toBeTruthy()
    await user.click(field('Custom coordinates'))
    expect(screen.getByRole('button', { name: 'Custom coordinates' }).getAttribute('aria-current')).toBe('true')
  })

  it('stars a row without closing, and shows the starred rows first under Starred', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    await user.click(region('Washington'))
    expect(star('Washington Top 100').getAttribute('aria-pressed')).toBe('false')
    expect(star('Washington Top 100').className).toBe(`${MENU_BROWSE.mark} ${MENU_BROWSE.markOff}`)
    await user.click(star('Washington Top 100'))
    // Still open, and the row now stands twice: under Starred and in its group.
    const starredGroup = screen.getByRole('group', { name: 'Starred' })
    expect(within(starredGroup).getByRole('button', { name: /^Washington Top 100 100 peaks$/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Star Washington Top 100' })).toHaveLength(2)
    for (const button of screen.getAllByRole('button', { name: 'Star Washington Top 100' })) {
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.className).toBe(`${MENU_BROWSE.mark} ${MENU_BROWSE.markOn}`)
    }
    expect((starredGroup.nextElementSibling as HTMLElement).className).toBe(MENU.divider)
    // Unstarring the last one takes the group away.
    await user.click(within(starredGroup).getByRole('button', { name: 'Star Washington Top 100' }))
    expect(screen.queryByRole('group', { name: 'Starred' })).toBeNull()
  })

  it('shows the starred rows in the order they were starred', async () => {
    const { user } = render(<Browse stars={['wy-13ers', 'wa-bulger-list']} />)
    await user.click(field())
    const starredGroup = screen.getByRole('group', { name: 'Starred' })
    expect(
      within(starredGroup)
        .getAllByRole('button', { name: /peaks?$/ })
        .map((b) => b.textContent),
    ).toEqual(['Wyoming 13ers 35 peaks', 'The Bulger List 100 peaks'])
  })

  it('opens a row\'s description under it from its info button, one at a time', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    await user.click(region('Washington'))
    expect(about('The Bulger List').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('The Bulger hundred.')).toBeNull()
    await user.click(about('The Bulger List'))
    expect(about('The Bulger List').getAttribute('aria-expanded')).toBe('true')
    const description = screen.getByText('The Bulger hundred.')
    expect(about('The Bulger List').getAttribute('aria-controls')).toBe(description.id)
    expect(description.className).toBe(MENU_BROWSE.description)
    await user.click(about('Washington Top 100'))
    expect(screen.queryByText('The Bulger hundred.')).toBeNull()
    expect(screen.getByText('The hundred highest.')).toBeTruthy()
    await user.click(about('Washington Top 100'))
    expect(screen.queryByText('The hundred highest.')).toBeNull()
    // None of it closed the card.
    expect(search()).toBeTruthy()
  })

  it('searches names, headings and a group\'s other words, and shows each match with its description', async () => {
    const { user } = render(<Browse stars={['wa-bulger-list']} />)
    await user.click(field())
    await user.type(search(), 'top')
    // The matches stand in for Starred, the groups and the other row.
    expect(screen.queryByRole('group', { name: 'Starred' })).toBeNull()
    expect(screen.queryByRole('button', { name: /\d+ lists?$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Custom coordinates' })).toBeNull()
    const found = screen.getByRole('group', { name: 'Washington' })
    expect(within(found).getByText('Washington').className).toBe(MENU_BROWSE.heading)
    expect(pick('Washington Top 100')).toBeTruthy()
    expect(noPick('The Bulger List')).toBe(true)
    expect(screen.getByText('The hundred highest.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'About Washington Top 100' })).toBeNull()
    // A heading finds its rows, and so does a state the heading does not name.
    await user.clear(search())
    await user.type(search(), 'washington')
    expect(pick('The Bulger List')).toBeTruthy()
    expect(pick('Washington Top 100')).toBeTruthy()
    await user.clear(search())
    await user.type(search(), 'montana')
    expect(pick('Wyoming 13ers')).toBeTruthy()
    expect(pick('Lone Peak List')).toBeTruthy()
    expect(noPick('The Bulger List')).toBe(true)
    // Every word, in any order and any case.
    await user.clear(search())
    await user.type(search(), '13ERS wyo')
    expect(pick('Wyoming 13ers')).toBeTruthy()
    expect(noPick('Lone Peak List')).toBe(true)
  })

  it('says so when a search finds nothing, and comes back when the box is emptied', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    await user.type(search(), 'everest')
    expect(screen.getByRole('status').textContent).toBe('Nothing found.')
    await user.clear(search())
    expect(screen.queryByRole('status')).toBeNull()
    expect(region('Washington')).toBeTruthy()
  })

  it('forgets the last search, group and description when it opens again', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    await user.type(search(), 'bulger')
    await user.keyboard('{Escape}')
    await user.click(field())
    expect((search() as HTMLInputElement).value).toBe('')
    expect(region('Washington').getAttribute('aria-expanded')).toBe('false')
  })

  it('walks the rows a press picks or opens with the arrow keys, from the search box and back', async () => {
    const { user } = render(<Browse />)
    await user.click(field())
    await user.click(region('Washington'))
    search().focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(region('Washington'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(pick('The Bulger List'))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Custom coordinates' }))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(region('Washington'))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(search())
    // A star is reached by Tab, never by the arrows, and the arrows leave it be.
    star('The Bulger List').focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(star('The Bulger List'))
  })

  it('opens from the field with the arrow keys, and closes on Escape with the keyboard back on the field', async () => {
    const { user } = render(<Browse />)
    field().focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(search())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search lists' })).toBeNull())
    expect(document.activeElement).toBe(field())
  })

  // A phone: the same rows in a sheet headed by the field's name, and the
  // keyboard stays down until the reader taps the search box.
  it('opens in a sheet on a phone, with the search box unfocused', async () => {
    const { user } = render(<Browse sheet />)
    await user.click(field())
    const dialog = screen.getByRole('dialog', { name: 'Coordinate list' })
    expect(within(dialog).getByRole('textbox', { name: 'Search lists' })).toBeTruthy()
    expect(document.activeElement).not.toBe(search())
    await user.click(region('Washington'))
    await user.click(pick('The Bulger List'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(field('The Bulger List')).toBeTruthy()
  })

  // Groups inside groups (#892): a continent opens to its countries and a
  // country to its regions, and a row can sit under a heading at any depth.
  describe('with groups inside groups', () => {
    const TREE: readonly BrowseGroup[] = [
      { name: 'North America', words: [] },
      { name: 'United States', words: [], parent: 'North America' },
      { name: 'Washington', words: [], parent: 'United States' },
      { name: 'Canada', words: ['Alberta'], parent: 'North America' },
      { name: 'Europe', words: [] },
      { name: 'Scotland', words: [], parent: 'Europe' },
      // No row under it at any depth, so neither heading is shown.
      { name: 'Asia', words: [] },
      { name: 'Japan', words: [], parent: 'Asia' },
    ]
    const ROWS: readonly BrowseItem[] = [
      { id: 'wa-bulger-list', name: 'The Bulger List', description: 'The Bulger hundred.', group: 'Washington', count: 100 },
      { id: 'canada-rockies', name: 'Canadian Rockies', description: 'The Rockies.', group: 'Canada', count: 54 },
      { id: 'north-america-high-points', name: 'Country High Points', description: 'One a country.', group: 'North America', count: 44 },
      { id: 'scotland-munros', name: 'Munros', description: 'Scotland.', group: 'Scotland', count: 282 },
    ]

    function Tree({ initial = '' }: { initial?: string }) {
      const [value, setValue] = useState(initial)
      return (
        <MenuBrowse
          label="Coordinate list"
          placeholder="Select a list"
          value={value}
          items={ROWS}
          groups={TREE}
          other={OTHER}
          onChange={setValue}
          starred={[]}
          onToggleStar={() => {}}
          widthRef={{ current: null }}
          className="w-40"
        />
      )
    }
    const shut = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name} \\d+ lists?$`) }) === null
    const isOpen = (name: string) => region(name).getAttribute('aria-expanded')

    it('counts every row under a heading, and shows no heading with none', async () => {
      const { user } = render(<Tree />)
      await user.click(field())
      expect(region('North America').textContent).toBe('North America 3 lists')
      expect(region('Europe').textContent).toBe('Europe 1 list')
      expect(shut('Asia')).toBe(true)
      // A group inside another waits for its parent to open.
      expect(shut('United States')).toBe(true)
      expect(noPick('Country High Points')).toBe(true)
    })

    it("opens one path at a time, a heading's groups before its own rows", async () => {
      const { user } = render(<Tree />)
      await user.click(field())
      await user.click(region('North America'))
      const inside = screen.getByRole('group', { name: 'North America' })
      expect(inside.className).toBe(MENU_BROWSE.nest)
      expect([...inside.querySelectorAll('[data-browse-item]')].map((each) => each.textContent)).toEqual([
        'United States 1 list',
        'Canada 1 list',
        'Country High Points 44 peaks',
      ])
      await user.click(region('United States'))
      await user.click(region('Washington'))
      expect(pick('The Bulger List')).toBeTruthy()
      expect(isOpen('North America')).toBe('true')
      expect(isOpen('United States')).toBe('true')
      // Each level is set in from the one above it.
      expect(screen.getByRole('group', { name: 'Washington' }).parentElement).toBe(
        screen.getByRole('group', { name: 'United States' }),
      )
      // A sibling shuts the path beside it and leaves the parent open.
      await user.click(region('Canada'))
      expect(isOpen('United States')).toBe('false')
      expect(shut('Washington')).toBe(true)
      expect(isOpen('North America')).toBe('true')
      expect(pick('Canadian Rockies')).toBeTruthy()
      // Shutting a group goes back to its parent.
      await user.click(region('Canada'))
      expect(isOpen('Canada')).toBe('false')
      expect(isOpen('North America')).toBe('true')
      await user.click(region('Europe'))
      expect(isOpen('North America')).toBe('false')
      expect(shut('Canada')).toBe(true)
    })

    it("opens on the picked row's group and every group above it", async () => {
      const { user } = render(<Tree initial="wa-bulger-list" />)
      await user.click(field('The Bulger List'))
      expect(isOpen('North America')).toBe('true')
      expect(isOpen('United States')).toBe('true')
      expect(isOpen('Washington')).toBe('true')
      expect(pick('The Bulger List').getAttribute('aria-current')).toBe('true')
    })

    it('finds a row by the name and the other words of any group above it', async () => {
      const { user } = render(<Tree />)
      await user.click(field())
      await user.type(search(), 'europe')
      expect(within(screen.getByRole('group', { name: 'Scotland' })).getByText('Scotland').className).toBe(
        MENU_BROWSE.heading,
      )
      expect(pick('Munros')).toBeTruthy()
      expect(noPick('The Bulger List')).toBe(true)
      await user.clear(search())
      await user.type(search(), 'north america')
      expect(pick('The Bulger List')).toBeTruthy()
      expect(pick('Canadian Rockies')).toBeTruthy()
      expect(pick('Country High Points')).toBeTruthy()
      expect(noPick('Munros')).toBe(true)
      await user.clear(search())
      await user.type(search(), 'alberta')
      expect(pick('Canadian Rockies')).toBeTruthy()
      expect(noPick('Country High Points')).toBe(true)
    })
  })
})
