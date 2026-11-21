import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import LimitChips from './LimitChips'
import { render } from '../testSupport/render'
import { NO_CONSTRAINTS } from '../utils/constraints'

// The bounds as chips under the lenses (record 0319).
describe('LimitChips', () => {
  it('draws a chip per bound, whose × clears that bound alone', () => {
    const onRemove = vi.fn()
    render(<LimitChips constraints={{ ...NO_CONSTRAINTS, maxWindMph: 20 }} onRemove={onRemove} onAdd={() => {}} hidden={0} />)
    const group = screen.getByRole('group', { name: 'Limits' })
    const remove = [...group.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label')?.startsWith('Remove '))
    expect(remove).toHaveLength(1)
    fireEvent.click(remove[0])
    expect(onRemove).toHaveBeenCalledWith('maxWindMph')
  })

  it('opens the Limits card from its pill, and says how many rows the bounds hide', () => {
    const onAdd = vi.fn()
    const { rerender } = render(<LimitChips constraints={NO_CONSTRAINTS} onRemove={() => {}} onAdd={onAdd} hidden={4} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limit' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(screen.getByText('4 hidden by limits')).toBeTruthy()
    rerender(<LimitChips constraints={NO_CONSTRAINTS} onRemove={() => {}} onAdd={onAdd} hidden={0} />)
    expect(screen.queryByText(/hidden by limits/)).toBeNull()
  })
})
