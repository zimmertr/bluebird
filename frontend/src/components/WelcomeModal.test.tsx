import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import WelcomeModal from './WelcomeModal'
import { render } from '../testSupport/render'
import { BUTTON_PRIMARY, DIALOG_FOOT } from '../styles'

// The dialog's copy is settled; what this suite holds is the layout #687
// changed: both actions in one foot that stays in view while the body
// scrolls, at one height.
describe('WelcomeModal', () => {
  it('keeps both actions in the sticky foot, under the body', () => {
    render(<WelcomeModal onDismiss={() => {}} onTutorial={() => {}} />)
    const search = screen.getByRole('button', { name: 'Search now' })
    const tutorial = screen.getByRole('button', { name: 'Take the tutorial' })
    const foot = search.parentElement as HTMLElement
    expect(tutorial.parentElement).toBe(foot)
    expect(foot.className).toBe(DIALOG_FOOT.bar)
    // The foot is the card's last child, so the body scrolls above it.
    expect(foot.parentElement?.lastElementChild).toBe(foot)
    expect(foot.parentElement?.getAttribute('role')).toBe('dialog')
  })

  it('stands the tutorial at the primary height', () => {
    render(<WelcomeModal onDismiss={() => {}} onTutorial={() => {}} />)
    expect(screen.getByRole('button', { name: 'Search now' }).className).toBe(BUTTON_PRIMARY)
    expect(screen.getByRole('button', { name: 'Take the tutorial' }).className).toBe(DIALOG_FOOT.secondary)
  })

  it('dismisses, or starts the tour, from the foot', async () => {
    const onDismiss = vi.fn()
    const onTutorial = vi.fn()
    const { user } = render(<WelcomeModal onDismiss={onDismiss} onTutorial={onTutorial} />)
    await user.click(screen.getByRole('button', { name: 'Search now' }))
    await user.click(screen.getByRole('button', { name: 'Take the tutorial' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onTutorial).toHaveBeenCalledOnce()
  })

  it('holds the tour while a draw or a run is under way', () => {
    render(<WelcomeModal onDismiss={() => {}} onTutorial={() => {}} tutorialWaits />)
    expect((screen.getByRole('button', { name: 'Take the tutorial' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
