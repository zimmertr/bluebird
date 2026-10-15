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

// The results step asks the sheet to open at rest before its spotlight reads
// it (#696), and only that step: the marker step after it collapses it.
describe('the tour opens the results for their step', () => {
  it('asks for the sheet at rest on the results step alone', () => {
    const { result } = setup()
    act(() => result.current.start())
    const seen: [string, boolean, boolean | null][] = []
    for (;;) {
      const i = result.current.index
      if (i === null) break
      seen.push([result.current.steps[i].anchor, result.current.sheetRest, result.current.sheetCollapsed])
      act(() => result.current.next())
    }
    expect(seen.filter(([, rest]) => rest).map(([a]) => a)).toEqual(['results'])
    expect(seen.find(([a]) => a === 'marker')?.[2]).toBe(true)
  })
})
