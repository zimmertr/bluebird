import { describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import ChartLayoutButton from './ChartLayoutButton'
import { render } from '../testSupport/render'
import { LAYOUT_LABEL, LAYOUT_NAMES, layoutsFor } from '../utils/chart/chartLayout'

// The Panel layout button and its menu (#499), and the tutorial's hold on
// that menu (#850).

const trigger = () => screen.getByRole('button', { name: LAYOUT_LABEL })
const menu = () => screen.queryByRole('group', { name: LAYOUT_LABEL })

describe('ChartLayoutButton', () => {
  it('opens the layouts the count offers, and closes on a pick', async () => {
    const onLayout = vi.fn()
    const { user } = render(<ChartLayoutButton layout="1-3" count={4} onLayout={onLayout} />)
    expect(menu()).toBeNull()
    await user.click(trigger())
    expect(menu()).not.toBeNull()
    for (const l of layoutsFor(4)) expect(screen.getByRole('button', { name: LAYOUT_NAMES[l] })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: LAYOUT_NAMES['2x2'] }))
    expect(onLayout).toHaveBeenCalledWith('2x2')
  })

  // The tutorial's Panel layout card holds the menu open for its length,
  // marks both for its light, and leaves the keyboard on its own card.
  it('holds the menu open for the tutorial without taking the keyboard, and lets it go', () => {
    const before = document.body.appendChild(document.createElement('button'))
    before.focus()
    const { rerender } = render(<ChartLayoutButton layout="1-3" count={4} onLayout={vi.fn()} forcedOpen />)
    expect(menu()?.dataset.tour).toBe('chart-layout-menu')
    expect(trigger().dataset.tour).toBe('chart-layout')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(before)
    act(() => rerender(<ChartLayoutButton layout="1-3" count={4} onLayout={vi.fn()} />))
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    before.remove()
  })
})
