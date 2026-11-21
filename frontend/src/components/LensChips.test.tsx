import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import LensChips, { LENS_LABEL } from './LensChips'
import { LENSES } from '../utils/score/lenses'
import { render } from '../testSupport/render'

// The lenses (record 0307): one toggle each, the lit one pressed, and a
// press on it ranks by the metric again.
describe('LensChips', () => {
  it('draws a toggle per lens, in order, with the ranking one pressed', () => {
    render(<LensChips lens="calm" onLens={() => {}} />)
    const group = screen.getByRole('group', { name: 'Lenses' })
    const toggles = [...group.querySelectorAll('button')]
    expect(toggles.map((b) => b.textContent)).toEqual(LENSES.map((l) => LENS_LABEL[l]))
    expect(toggles.map((b) => b.getAttribute('aria-pressed'))).toEqual(LENSES.map((l) => String(l === 'calm')))
  })

  it('takes another lens, and lets go of the lit one', () => {
    const onLens = vi.fn()
    render(<LensChips lens="bluebird" onLens={onLens} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clean air' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bluebird' }))
    expect(onLens.mock.calls.map((c) => c[0])).toEqual(['clean', null])
  })
})
