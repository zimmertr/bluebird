import { describe, expect, it, vi } from 'vitest'
import { takeOrphanedFocus } from './useFocusHandoff'

// The replacement takes the keyboard where it stands (#696): a phone's
// Controls sheet takes it for its Done button as the sheet starts sliding up
// from below the screen, and a focus that scrolled carried the app's column
// 465px up and back down with the slide.
describe('takeOrphanedFocus', () => {
  it('takes an orphaned focus without scrolling', () => {
    const pressed = document.body.appendChild(document.createElement('button'))
    pressed.focus()
    pressed.remove()
    const replacement = document.body.appendChild(document.createElement('button'))
    const focus = vi.spyOn(replacement, 'focus')
    takeOrphanedFocus(replacement)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(replacement)
    replacement.remove()
  })

  it('leaves a focus a reader still holds alone', () => {
    const held = document.body.appendChild(document.createElement('button'))
    held.focus()
    const other = document.body.appendChild(document.createElement('button'))
    takeOrphanedFocus(other)
    expect(document.activeElement).toBe(held)
    held.remove()
    other.remove()
  })
})
