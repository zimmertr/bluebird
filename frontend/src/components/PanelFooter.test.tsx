import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
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
    loading: false,
    onAnalyze: () => {},
    onRetry: () => {},
    onTutorial: () => {},
    messages: [],
    ...over,
  }
}

const MESSAGES: FooterMessage[] = [
  { key: 'blocker:types', text: 'Info line.', severity: 'info' },
  { key: 'cue:model-changed', text: 'First warning.', severity: 'warn' },
  { key: 'error:boom', text: 'Run failed.', severity: 'error', retry: true },
  { key: 'cue:window-changed', text: 'Second warning.', severity: 'warn' },
]

const analyze = () => screen.getByRole('button', { name: /^(Analyze|Analyzing…)$/ })
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

  it('disables the button when the panel says so, and names a running analysis', () => {
    render(<PanelFooter {...props({ analyzeEnabled: false, loading: true })} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
    expect(analyze().textContent).toBe('Analyzing…')
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

  it('offers a retry only in a box holding a failed run', async () => {
    const onRetry = vi.fn()
    const { user } = render(<PanelFooter {...props({ messages: MESSAGES, onRetry })} />)
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    await user.click(within(boxes()[0]).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('dismisses one message and keeps its box for the rest', async () => {
    const { user } = render(<PanelFooter {...props({ messages: MESSAGES })} />)
    const [first] = within(boxes()[1]).getAllByRole('button', { name: 'Dismiss notice' })
    await user.click(first)
    expect(boxes()[1].textContent).not.toMatch(/First warning/)
    expect(boxes()[1].textContent).toMatch(/Second warning/)
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
        <PanelFooter {...props({ analyzeEnabled: false, loading: true })} />
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
})
