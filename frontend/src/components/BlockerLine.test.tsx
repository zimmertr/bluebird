import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import BlockerLine from './BlockerLine'
import { render } from '../testSupport/render'
import { BLOCKER_LINE, STATUS } from '../styles'
import type { FooterMessage } from '../utils/notices'

// A blocker's line under its field (record 0208): the sentence in its
// severity's colour with a dot before it, no box, no ×, and nothing announced,
// since the live region beside the badge already holds the same sentence.

const LINES: FooterMessage[] = [
  { key: 'blocker:polygon', text: 'Draw at least three points.', severity: 'info' },
  { key: 'blocker:area', text: 'The polygon is too large.', severity: 'error' },
]

describe('BlockerLine', () => {
  it('draws nothing for no lines', () => {
    const { container } = render(<BlockerLine lines={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('draws each line in its severity colour with a dot, and nothing to press', () => {
    render(<BlockerLine lines={LINES} />)
    const first = screen.getByText('Draw at least three points.')
    expect(first.className).toBe(`${BLOCKER_LINE.row} ${STATUS.info}`)
    expect(screen.getByText('The polygon is too large.').className).toBe(`${BLOCKER_LINE.row} ${STATUS.error}`)
    const dot = first.firstElementChild as HTMLElement
    expect(dot.className).toBe(BLOCKER_LINE.dot)
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
