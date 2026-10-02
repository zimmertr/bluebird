import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTour } from './useTour'

// The tour's card takes the keyboard for its whole run and then unmounts, so
// the focus would fall to the body when it ends. These pin where it goes back
// to (#576). The rest of the tour is driven end to end in the browser suite.

function setup() {
  return renderHook(() =>
    useTour({ isDesktop: true, sidebarOpen: true, setSidebarOpen: () => {}, mapRef: { current: null } }),
  )
}

describe('the tour hands the keyboard back', () => {
  it('to the control that started it', () => {
    const link = document.body.appendChild(document.createElement('a'))
    link.href = '/tutorial'
    const card = document.body.appendChild(document.createElement('button'))
    link.focus()
    const { result } = setup()
    act(() => result.current.start())
    // The card takes the focus while the tour runs.
    card.focus()
    act(() => result.current.end())
    expect(document.activeElement).toBe(link)
    link.remove()
    card.remove()
  })

  it('to nothing when that control has left the page', () => {
    const welcome = document.body.appendChild(document.createElement('button'))
    welcome.focus()
    const { result } = setup()
    act(() => result.current.start())
    welcome.remove()
    act(() => result.current.end())
    expect(document.activeElement).toBe(document.body)
  })
})
