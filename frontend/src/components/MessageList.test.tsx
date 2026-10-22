import type { RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import MessageList, { MESSAGES_HEADING } from './MessageList'
import { render } from '../testSupport/render'
import { MENU, MESSAGE_LIST, NOTICE, STATUS } from '../styles'
import type { PopoverBox } from '../utils/listbox'
import type { FooterMessage } from '../utils/notices'

// The one list every message is in (record 0208): boxed by severity on the
// one menu, a card at a desk and a sheet headed Messages on a phone, each
// message with its × unless it is a blocker, and nothing announced from here.

const MESSAGES: FooterMessage[] = [
  { key: 'blocker:types', text: 'Info line.', severity: 'info' },
  { key: 'cue:model-changed', text: 'First warning.', severity: 'warn' },
  { key: 'error:boom', text: 'Run failed.', severity: 'error' },
  { key: 'cue:window-changed', text: 'Second warning.', severity: 'warn' },
]

// Where `usePopover` would put the card; the list draws the same wherever.
const BOX: PopoverBox = {
  align: { left: 20 },
  width: null,
  minWidth: 120,
  maxWidth: 400,
  maxHeight: 300,
  placement: 'below',
  offset: { top: 100 },
}
const NO_REF: RefObject<HTMLDivElement | null> = { current: null }

const list = () => screen.getByRole('group', { name: MESSAGES_HEADING })
const boxes = () => [...list().children] as HTMLElement[]

describe('MessageList', () => {
  it('boxes the messages by severity, error first, in order inside each box', () => {
    render(<MessageList messages={MESSAGES} onDismiss={() => {}} card={{ box: BOX, popoverRef: NO_REF, closing: false }} />)
    expect(boxes().map((b) => b.textContent)).toEqual([
      expect.stringContaining('Run failed.'),
      expect.stringMatching(/First warning\..*Second warning\./),
      expect.stringContaining('Info line.'),
    ])
    expect(boxes().map((b) => b.className)).toEqual([
      `${NOTICE.error} ${STATUS.error}`,
      `${NOTICE.warn} ${STATUS.warn}`,
      `${NOTICE.info} ${STATUS.info}`,
    ])
  })

  it('gives every message but a blocker a dismiss, keyed on the message', () => {
    const onDismiss = vi.fn()
    render(<MessageList messages={MESSAGES} onDismiss={onDismiss} card={{ box: BOX, popoverRef: NO_REF, closing: false }} />)
    const [error, warn, info] = boxes()
    fireEvent.click(within(error).getByRole('button', { name: 'Dismiss notice' }))
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('error:boom')
    expect(within(warn).getAllByRole('button', { name: 'Dismiss notice' })).toHaveLength(2)
    expect(within(info).queryByRole('button')).toBeNull()
  })

  // At a desk the list is the one menu's card, portalled out of the tree.
  it('stands on the menu card at a desk, named Messages, announcing nothing', () => {
    const { container } = render(
      <MessageList messages={MESSAGES} onDismiss={() => {}} card={{ box: BOX, popoverRef: NO_REF, closing: false }} />,
    )
    const card = list().closest<HTMLElement>('[style]')!
    expect(card.className).toBe(MENU.card)
    expect(container.contains(card)).toBe(false)
    expect(list().className).toBe(MESSAGE_LIST.card)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // On a phone it is a bottom sheet headed Messages, closed by Done.
  it('is a sheet headed Messages on a phone, closed by Done', () => {
    const onClose = vi.fn()
    render(<MessageList messages={MESSAGES} onDismiss={() => {}} sheet={{ onClose }} />)
    const sheet = screen.getByRole('dialog', { name: MESSAGES_HEADING })
    expect(sheet.contains(list())).toBe(true)
    expect(list().className).toBe(MESSAGE_LIST.sheet)
    expect(boxes()).toHaveLength(3)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
