import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MessageBadge, { MessageRegion, messagesLabel } from './MessageBadge'
import { render } from '../testSupport/render'
import { MESSAGE_BADGE, SR_ONLY } from '../styles'
import type { FooterMessage } from '../utils/notices'

// The count on the Analyze button (record 0208): how many and how bad, and
// nothing else, with the one live region beside it holding the words.

const MESSAGES: FooterMessage[] = [
  { key: 'error:boom', text: 'Run failed.', severity: 'error' },
  { key: 'cue:model-changed', text: 'First warning.', severity: 'warn' },
]

describe('MessageBadge', () => {
  it('draws nothing with no messages', () => {
    const { container } = render(<MessageBadge count={0} worst={null} open={false} onPress={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the count, names it in words, and wears the worst severity', () => {
    const onPress = vi.fn()
    const { rerender } = render(<MessageBadge count={3} worst="warn" open={false} onPress={onPress} />)
    const badge = screen.getByRole('button', { name: '3 messages' })
    expect(badge.textContent).toBe('3')
    expect(badge.className).toBe(`${MESSAGE_BADGE.base} ${MESSAGE_BADGE.warn}`)
    expect(badge.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(badge)
    expect(onPress).toHaveBeenCalledOnce()
    rerender(<MessageBadge count={1} worst="error" open onPress={onPress} />)
    const one = screen.getByRole('button', { name: '1 message' })
    expect(one.className).toBe(`${MESSAGE_BADGE.base} ${MESSAGE_BADGE.error}`)
    expect(one.getAttribute('aria-expanded')).toBe('true')
  })

  it('names one message in the singular and the rest in the plural', () => {
    expect(messagesLabel(1)).toBe('1 message')
    expect(messagesLabel(2)).toBe('2 messages')
  })
})

describe('MessageRegion', () => {
  // A region that arrives already holding its text is not announced, so it
  // is mounted empty and the same element holds every message after (#576).
  it('is one live region, out of sight, holding every message in order', () => {
    const { rerender } = render(<MessageRegion messages={[]} />)
    const region = screen.getByRole('status')
    expect(region.className).toBe(SR_ONLY)
    expect(region.textContent).toBe('')
    rerender(<MessageRegion messages={MESSAGES} />)
    expect(screen.getByRole('status')).toBe(region)
    expect([...region.children].map((p) => p.textContent)).toEqual(['Run failed.', 'First warning.'])
  })
})
