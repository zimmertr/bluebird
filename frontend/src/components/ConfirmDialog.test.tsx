import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog'
import { render } from '../testSupport/render'

const props = (over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => ({
  question: 'Load The Bulger List?',
  body: 'This replaces the rows in the Coordinate search box.',
  confirmLabel: 'Load',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  ...over,
})

describe('ConfirmDialog', () => {
  it('is a modal dialog named by its question, with the yes word and Cancel', () => {
    render(<ConfirmDialog {...props()} />)
    const dialog = screen.getByRole('dialog', { name: 'Load The Bulger List?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('This replaces the rows in the Coordinate search box.')).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Load', 'Cancel'])
    expect(document.activeElement).toBe(dialog)
  })

  it('answers yes from its button, and no from Cancel, Escape or the scrim', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...props({ onConfirm, onCancel })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })
})
