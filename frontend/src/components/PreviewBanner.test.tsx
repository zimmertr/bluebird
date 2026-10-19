import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import PreviewBanner from './PreviewBanner'
import { render } from '../testSupport/render'
import { REPO_URL } from '../utils/contact'

describe('PreviewBanner', () => {
  it('links a preview to its pull request, and names an unknown one without a link', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const { unmount } = render(<PreviewBanner pr="123" commit={commit} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`${REPO_URL}/pull/123`)
    expect(link.textContent).toBe('You are viewing a preview release of Bluebird Forecast | PR: 123 | Commit: 0123456')
    unmount()

    const { container } = render(<PreviewBanner pr={null} commit={null} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toBe('You are viewing a preview release of Bluebird Forecast | PR: unknown | Commit: unknown')
  })
})
