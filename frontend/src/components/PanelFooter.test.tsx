import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import PanelFooter from './PanelFooter'
import type { FooterMessage } from '../utils/notices'
import { render } from '../testSupport/render'

// The footer draws what `panelMessages` decided: the button, then one box per
// severity with each message dismissable alone, then the two document links.
// Which messages exist is that module's suite; this one is where they land.

type Props = ComponentProps<typeof PanelFooter>

function props(over: Partial<Props> = {}): Props {
  return {
    analyzeEnabled: true,
    word: 'Analyze',
    onAnalyze: () => {},
    onDismissEvent: () => {},
    onTutorial: () => {},
    messages: [],
    ...over,
  }
}

const MESSAGES: FooterMessage[] = [
  { key: 'blocker:types', text: 'Info line.', severity: 'info' },
  { key: 'cue:model-changed', text: 'First warning.', severity: 'warn' },
  { key: 'error:boom', text: 'Run failed.', severity: 'error' },
  { key: 'cue:window-changed', text: 'Second warning.', severity: 'warn' },
]

const analyze = () => screen.getByRole('button', { name: /^(Analyze|Analyzing…|Try again)$/ })
// The boxes stand inside the footer's one live region, which is mounted for
// good so a box that arrives is announced.
const boxes = () => [...screen.getByRole('status').children] as HTMLElement[]

describe('PanelFooter', () => {
  it('analyzes on a press while enabled', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(<PanelFooter {...props({ onAnalyze })} />)
    await user.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('disables the button when the panel says so, and reads the word it is handed', () => {
    const { rerender } = render(<PanelFooter {...props({ analyzeEnabled: false, word: 'Analyzing…' })} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
    expect(analyze().textContent).toBe('Analyzing…')
    // After a failed run the one button is the retry (#736): same button,
    // same command, a different word.
    const onAnalyze = vi.fn()
    rerender(<PanelFooter {...props({ word: 'Try again', onAnalyze })} />)
    expect(analyze().textContent).toBe('Try again')
    fireEvent.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('draws no box with nothing to say', () => {
    render(<PanelFooter {...props()} />)
    expect(boxes()).toEqual([])
  })

  it('boxes the messages by severity, error first, in order inside each box', () => {
    render(<PanelFooter {...props({ messages: MESSAGES })} />)
    expect(boxes().map((b) => b.textContent)).toEqual([
      expect.stringContaining('Run failed.'),
      expect.stringMatching(/First warning\..*Second warning\./),
      expect.stringContaining('Info line.'),
    ])
    for (const box of boxes()) {
      expect(analyze().compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  // The error box used to end in a Try again of its own, a second button
  // under Analyze that did what Analyze does (#736). Now the box holds its
  // lines and their dismiss controls, and nothing a reader presses to run.
  it('puts no button but the dismiss controls in any box', () => {
    render(<PanelFooter {...props({ messages: MESSAGES, word: 'Try again' })} />)
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    for (const box of boxes()) {
      expect(within(box).getAllByRole('button').every((b) => b.getAttribute('aria-label') === 'Dismiss notice')).toBe(true)
    }
  })

  it('dismisses one message and keeps its box for the rest', async () => {
    const { user } = render(<PanelFooter {...props({ messages: MESSAGES })} />)
    const [first] = within(boxes()[1]).getAllByRole('button', { name: 'Dismiss notice' })
    await user.click(first)
    expect(boxes()[1].textContent).not.toMatch(/First warning/)
    expect(boxes()[1].textContent).toMatch(/Second warning/)
  })

  // An event line is one run's outcome, held as state: dismissing it clears
  // the event (#736), so the button that read Try again off the error reads
  // Analyze again, rather than hiding the line in this footer's ledger.
  it('hands the dismissal of an event line up, and keeps the ledger for the derived lines', async () => {
    const onDismissEvent = vi.fn()
    const { user, rerender } = render(<PanelFooter {...props({ messages: MESSAGES, onDismissEvent })} />)
    await user.click(within(boxes()[0]).getByRole('button', { name: 'Dismiss notice' }))
    expect(onDismissEvent).toHaveBeenCalledExactlyOnceWith('error')
    // The line stays until its state clears above; nothing here hid it.
    expect(boxes()[0].textContent).toMatch(/Run failed/)
    rerender(<PanelFooter {...props({ messages: MESSAGES.filter((m) => m.key !== 'error:boom'), onDismissEvent })} />)
    expect(boxes()[0].textContent).not.toMatch(/Run failed/)
    const refusal: FooterMessage[] = [{ key: 'refusal:Too many.', text: 'Too many.', severity: 'error' }]
    rerender(<PanelFooter {...props({ messages: refusal, onDismissEvent })} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }))
    expect(onDismissEvent).toHaveBeenLastCalledWith('refusal')
  })

  // A dismissal lives as long as its condition: once the message is gone and
  // comes back, it is news again.
  it('shows a dismissed message again after its condition clears and returns', async () => {
    const lone: FooterMessage[] = [{ key: 'cue:model-changed', text: 'First warning.', severity: 'warn' }]
    const { user, rerender } = render(<PanelFooter {...props({ messages: lone })} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }))
    expect(boxes()).toEqual([])
    rerender(<PanelFooter {...props({ messages: [] })} />)
    rerender(<PanelFooter {...props({ messages: lone })} />)
    expect(boxes()).toHaveLength(1)
  })

  // A box that arrives already holding its text is not announced by most
  // screen readers, so the region is there before anything is said (#576).
  it('keeps one live region mounted, empty until there is something to say', () => {
    const { rerender } = render(<PanelFooter {...props()} />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
    rerender(<PanelFooter {...props({ messages: MESSAGES })} />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toMatch(/Run failed\./)
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

  // On a phone the whole block stands in the band the map holds (#696;
  // record 0140), informing lines and action lines alike, and the Controls
  // sheet keeps none of it. At a desk it is one block under the button.
  it('sends the whole block to the home it is handed on a phone, and keeps none of it', () => {
    const home = document.createElement('div')
    document.body.appendChild(home)
    const { container, rerender } = render(<PanelFooter {...props({ messages: MESSAGES, noticeHome: home, phone: true })} />)
    const regions = screen.getAllByRole('status')
    expect(regions).toHaveLength(1)
    const onMap = regions[0]
    expect(home.contains(onMap)).toBe(true)
    expect(within(onMap).getByText('First warning.')).toBeTruthy()
    expect(within(onMap).getByText('Run failed.')).toBeTruthy()
    expect(within(onMap).getByText('Info line.')).toBeTruthy()
    // What the sheet keeps is the document links alone.
    expect(container.textContent).toBe('Tutorial · Privacy · Terms')
    rerender(<PanelFooter {...props({ messages: MESSAGES })} />)
    expect(home.childElementCount).toBe(0)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(container.contains(screen.getByRole('status'))).toBe(true)
    home.remove()
  })

  // The band mounts after the sheet on a phone's first frame; the block waits
  // for it rather than flashing into the sheet.
  it('draws the block nowhere on a phone whose band is not there yet', () => {
    const { container } = render(<PanelFooter {...props({ messages: MESSAGES, phone: true })} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.textContent).toBe('Tutorial · Privacy · Terms')
  })

  // A phone's one Analyze is the map's floating button (record 0135), so the
  // sheet's footer draws none.
  it('draws no Analyze on a phone', () => {
    const { container, rerender } = render(<PanelFooter {...props({ phone: true })} />)
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
    // The tour's Analyze step lights the map's button instead.
    expect(container.querySelector('[data-tour="analyze"]')).toBeNull()
    rerender(<PanelFooter {...props()} />)
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeTruthy()
  })

  // A dismissal is the one ledger's wherever the block stands.
  it('dismisses a line on the map from the same ledger', () => {
    const home = document.createElement('div')
    document.body.appendChild(home)
    render(<PanelFooter {...props({ messages: MESSAGES, noticeHome: home, phone: true })} />)
    expect(within(home).getByText('First warning.')).toBeTruthy()
    const dismiss = within(home)
      .getAllByRole('button', { name: 'Dismiss notice' })
      .find((b) => b.parentElement?.textContent?.includes('First warning.'))!
    fireEvent.click(dismiss)
    expect(within(home).queryByText('First warning.')).toBeNull()
    home.remove()
  })
})
