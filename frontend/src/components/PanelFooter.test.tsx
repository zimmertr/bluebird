import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import PanelFooter from './PanelFooter'
import type { FooterMessage } from '../utils/notices'
import { panelMessages } from '../testSupport/fixtures'
import { placeAt, render } from '../testSupport/render'
import { MESSAGE_BADGE } from '../styles'

// The footer draws what `usePanelMessages` decided (record 0208): the Analyze
// button with the count on its corner, the list the badge opens over it, and
// the two document links. Which messages exist is that hook's suite; this one
// is where they land and how the list opens.

type Props = ComponentProps<typeof PanelFooter>

function props(over: Partial<Props> = {}): Props {
  return {
    analyzeEnabled: true,
    word: 'Analyze',
    onAnalyze: () => {},
    onTutorial: () => {},
    messages: panelMessages(),
    ...over,
  }
}

const MESSAGES: FooterMessage[] = [
  { key: 'blocker:types', text: 'Info line.', severity: 'info' },
  { key: 'cue:model-changed', text: 'First warning.', severity: 'warn' },
  { key: 'error:boom', text: 'Run failed.', severity: 'error' },
  { key: 'cue:window-changed', text: 'Second warning.', severity: 'warn' },
]

const analyze = () => screen.getByRole('button', { name: /^(Analyze|Analyzing…|Try again)$/ }) as HTMLButtonElement
const badge = () => screen.getByRole('button', { name: /^\d+ messages?$/ })
const list = () => screen.getByRole('group', { name: 'Messages' })
const boxes = () => [...list().children] as HTMLElement[]

afterEach(() => vi.restoreAllMocks())

describe('PanelFooter', () => {
  it('analyzes on a press while enabled', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(<PanelFooter {...props({ onAnalyze })} />)
    await user.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('disables the button while busy, and reads the word it is handed', () => {
    const { rerender } = render(<PanelFooter {...props({ analyzeEnabled: false, word: 'Analyzing…' })} />)
    expect(analyze().disabled).toBe(true)
    expect(analyze().getAttribute('aria-disabled')).toBeNull()
    expect(analyze().textContent).toBe('Analyzing…')
    // After a failed run the one button is the retry (#736): same button,
    // same command, a different word.
    const onAnalyze = vi.fn()
    rerender(<PanelFooter {...props({ word: 'Try again', onAnalyze })} />)
    expect(analyze().textContent).toBe('Try again')
    fireEvent.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('wears no badge and opens no list with nothing to say', () => {
    render(<PanelFooter {...props()} />)
    expect(screen.queryByRole('button', { name: /messages?$/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
  })

  it('counts the messages on the button in the worst one\'s colour, and opens the list from the badge', async () => {
    const { user } = render(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES }) })} />)
    expect(badge().textContent).toBe('4')
    expect(badge().getAttribute('aria-label')).toBe('4 messages')
    expect(badge().className).toContain(MESSAGE_BADGE.error)
    // In the slot the button stands in, so a greyed button leaves it whole.
    expect(badge().parentElement).toBe(analyze().parentElement)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    await user.click(badge())
    expect(badge().getAttribute('aria-expanded')).toBe('true')
    expect(boxes().map((b) => b.textContent)).toEqual([
      expect.stringContaining('Run failed.'),
      expect.stringMatching(/First warning\..*Second warning\./),
      expect.stringContaining('Info line.'),
    ])
    await user.click(badge())
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
  })

  // A blocker greys the button and leaves it live (the maintainer,
  // 2026-10-21): a press anywhere on it opens the list, and runs nothing.
  it('opens the list from a press on the greyed button while a blocker holds it', async () => {
    const onAnalyze = vi.fn()
    const blocked = panelMessages({ messages: [MESSAGES[0]], analyzeEnabled: false, blocked: true })
    const { user } = render(<PanelFooter {...props({ onAnalyze, analyzeEnabled: false, messages: blocked })} />)
    expect(analyze().disabled).toBe(false)
    expect(analyze().getAttribute('aria-disabled')).toBe('true')
    await user.click(analyze())
    expect(onAnalyze).not.toHaveBeenCalled()
    expect(within(list()).getByText('Info line.')).toBeTruthy()
    await user.click(analyze())
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
  })

  it('hands a dismissal up by its key, and leaves a blocker with no way to dismiss', async () => {
    const dismiss = vi.fn()
    const { user } = render(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES, dismiss }) })} />)
    await user.click(badge())
    const [error, warn, info] = boxes()
    await user.click(within(error).getByRole('button', { name: 'Dismiss notice' }))
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('error:boom')
    expect(within(warn).getAllByRole('button', { name: 'Dismiss notice' })).toHaveLength(2)
    expect(within(info).queryByRole('button')).toBeNull()
  })

  // The list goes with the last message, since there is nothing left to list.
  it('closes the list when the last message goes', async () => {
    const { user, rerender } = render(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES }) })} />)
    await user.click(badge())
    expect(list()).toBeTruthy()
    rerender(<PanelFooter {...props()} />)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    expect(screen.queryByRole('button', { name: /messages?$/ })).toBeNull()
  })

  // The tutorial's Messages card holds the list open over its demonstration
  // (#786), under the anchor the card frames, and lets it go when it moves on.
  it('holds the list open for the tutorial, and lets it go with the card', () => {
    const { rerender } = render(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES, held: true }) })} />)
    expect(list().getAttribute('data-tour')).toBe('messages-list')
    expect(badge().getAttribute('aria-expanded')).toBe('true')
    rerender(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES }) })} />)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
  })

  // A box that arrives already holding its text is not announced by most
  // screen readers, so the region is there before anything is said (#576),
  // and holds every message whether or not the list is open.
  it('keeps one live region mounted beside the button, holding every message', () => {
    const { rerender } = render(<PanelFooter {...props()} />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
    expect(region.parentElement).toBe(analyze().parentElement)
    rerender(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES }) })} />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toMatch(/Run failed\./)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  // Analyze turns disabled under the keyboard that pressed it; once the run
  // is over and whatever held the focus meanwhile is gone, the focus comes
  // back to the button rather than to the body (#576).
  it('takes the keyboard back when a run ends and the focus has nowhere else', async () => {
    const { user, rerender } = render(
      <>
        <PanelFooter {...props()} />
        <button>Cancel</button>
      </>,
    )
    await user.click(analyze())
    rerender(
      <>
        <PanelFooter {...props({ analyzeEnabled: false, word: 'Analyzing…' })} />
        <button>Cancel</button>
      </>,
    )
    screen.getByRole('button', { name: 'Cancel' }).focus()
    // The run ends: Cancel goes, and the button comes back.
    rerender(<PanelFooter {...props()} />)
    expect(document.activeElement).toBe(analyze())
  })

  it('leaves the focus alone when it is somewhere a reader put it', async () => {
    const { user, rerender } = render(
      <>
        <PanelFooter {...props({ analyzeEnabled: false })} />
        <input aria-label="Elsewhere" />
      </>,
    )
    await user.click(screen.getByRole('textbox', { name: 'Elsewhere' }))
    rerender(
      <>
        <PanelFooter {...props()} />
        <input aria-label="Elsewhere" />
      </>,
    )
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Elsewhere' }))
  })

  it('links the tour at its path and starts it in place on a plain click', async () => {
    const onTutorial = vi.fn()
    const { user } = render(<PanelFooter {...props({ onTutorial })} />)
    const link = screen.getByRole('link', { name: 'Tutorial' })
    expect(link.getAttribute('href')).toBe('/tutorial')
    expect(link.getAttribute('target')).toBeNull()
    await user.click(link)
    expect(onTutorial).toHaveBeenCalledOnce()
  })

  it('answers no click on the tour link while it waits, and says so', async () => {
    const onTutorial = vi.fn()
    const { user } = render(<PanelFooter {...props({ onTutorial, tutorialWaits: true })} />)
    const link = screen.getByRole('link', { name: 'Tutorial' })
    expect(link.getAttribute('aria-disabled')).toBe('true')
    await user.click(link)
    expect(onTutorial).not.toHaveBeenCalled()
  })

  it('links the two document pages in a new tab', () => {
    render(<PanelFooter {...props()} />)
    for (const [name, href] of [
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
    }
  })

  // #803: a failure that showed only as a count read as no failure at all,
  // so a run that fails opens the list itself, and the badge says so.
  it('opens the list when a run fails, and closes it as a press would', async () => {
    const failed = panelMessages({ messages: MESSAGES, failureSeq: 1 })
    const { rerender, user } = render(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES }) })} />)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    rerender(<PanelFooter {...props({ messages: failed })} />)
    expect(list()).toBeTruthy()
    expect(badge().getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    // A re-render of the same failure opens nothing; the next failure does.
    rerender(<PanelFooter {...props({ messages: { ...failed } })} />)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    rerender(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES, failureSeq: 2 }) })} />)
    expect(list()).toBeTruthy()
  })

  // The card is the button's width (#803): a line longer than the slot wraps
  // inside it rather than widening the card past the panel over the map.
  // jsdom lays nothing out, so the card is told its lines want 600px.
  it("stands the list at the button's width, however long a line is", async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 600)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => 120)
    const long: FooterMessage = {
      key: 'error:cap',
      text: 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.',
      severity: 'error',
    }
    const { user } = render(<PanelFooter {...props({ messages: panelMessages({ messages: [long] }) })} />)
    placeAt(analyze().parentElement!, { left: 16, top: 700, width: 328, height: 44 })
    await user.click(badge())
    const card = list().closest<HTMLElement>('[style]')!
    expect(card.style.width).toBe('328px')
    expect(card.style.left).toBe('16px')
    // Nothing between the line and the card keeps it on one line.
    let el: HTMLElement | null = within(list()).getByText(long.text)
    while (el && el !== card) {
      expect(el.className).not.toMatch(/whitespace-nowrap/)
      el = el.parentElement
    }
  })

  // #834: a check or the basemap failing opens the list too, and leaves the
  // keyboard where it was, since the line can land while the reader types in
  // a field. A failed run over the open list takes the keyboard in, as ever.
  it('opens the list for a check or basemap failure without taking the keyboard', () => {
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    const { rerender } = render(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES }) })} />)
    rerender(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES, openingSeq: 1 }) })} />)
    expect(list()).toBeTruthy()
    expect(badge().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(field)
    rerender(<PanelFooter {...props({ messages: panelMessages({ messages: MESSAGES, openingSeq: 1, failureSeq: 1 }) })} />)
    expect(list().contains(document.activeElement)).toBe(true)
    field.remove()
  })

  it('opens nothing on a phone, whose footer has no list', () => {
    const { rerender } = render(<PanelFooter {...props({ phone: true, messages: panelMessages({ messages: MESSAGES }) })} />)
    rerender(<PanelFooter {...props({ phone: true, messages: panelMessages({ messages: MESSAGES, failureSeq: 1 }) })} />)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    rerender(
      <PanelFooter {...props({ phone: true, messages: panelMessages({ messages: MESSAGES, failureSeq: 1, openingSeq: 1 }) })} />,
    )
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
  })

  // A phone's one Analyze is the map's floating button (record 0135), which
  // wears the badge and the region: the sheet's footer is the links alone.
  it('draws the links alone on a phone', () => {
    const { container, rerender } = render(
      <PanelFooter {...props({ phone: true, messages: panelMessages({ messages: MESSAGES }) })} />,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.textContent).toBe('Tutorial · Privacy · Terms')
    // The tour's Analyze step lights the map's button instead.
    expect(container.querySelector('[data-tour="analyze"]')).toBeNull()
    rerender(<PanelFooter {...props()} />)
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeTruthy()
  })
})
