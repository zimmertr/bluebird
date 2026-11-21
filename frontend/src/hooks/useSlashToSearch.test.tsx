import { describe, expect, it, vi } from 'vitest'
import { fireEvent, renderHook } from '@testing-library/react'
import { useSlashToSearch } from './useSlashToSearch'

// `/` opens the Where card and puts the keyboard in its search (record 0313).
describe('useSlashToSearch', () => {
  it('opens the card on `/` and focuses the field once it has mounted', () => {
    const open = vi.fn()
    let mounted = false
    const focus = vi.fn(() => mounted)
    const { rerender } = renderHook(() => useSlashToSearch(true, open, focus))
    fireEvent.keyDown(document.body, { key: '/' })
    expect(open).toHaveBeenCalledTimes(1)
    // The field arrives with the next commit, and takes the keyboard then.
    mounted = true
    rerender()
    expect(focus).toHaveBeenLastCalledWith()
    const calls = focus.mock.calls.length
    rerender()
    expect(focus.mock.calls.length).toBe(calls)
  })

  it('leaves `/` alone in a field, with a modifier, and on a phone', () => {
    const open = vi.fn()
    const { rerender } = renderHook(({ on }) => useSlashToSearch(on, open, () => true), { initialProps: { on: true } })
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: '/' })
    fireEvent.keyDown(document.body, { key: '/', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(open).not.toHaveBeenCalled()
    rerender({ on: false })
    fireEvent.keyDown(document.body, { key: '/' })
    expect(open).not.toHaveBeenCalled()
    input.remove()
  })
})
