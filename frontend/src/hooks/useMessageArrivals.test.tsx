import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMessageArrivals } from './useMessageArrivals'
import type { FooterMessage } from '../utils/notices'

// #834: what arrived in the list the reader sees. Every arrival moves the
// badge; only a check or the basemap failing opens the list.

const line = (key: string): FooterMessage => ({ key, text: key, severity: 'warn' })
const BLOCKER = line('blocker:destinations')
const CUE = line('cue:window-changed')
const FIRE = line('fire:unavailable')
const CLOSURE = line('closure:unavailable')
const MAP = line('map:style')

function arrivals(initial: readonly FooterMessage[]) {
  return renderHook(({ messages }) => useMessageArrivals(messages), { initialProps: { messages: initial } })
}

describe('useMessageArrivals', () => {
  it('takes the messages at mount as seen', () => {
    const { result } = arrivals([BLOCKER])
    expect(result.current).toEqual({ arrivalSeq: 0, openingSeq: 0 })
  })

  it('moves the badge for any new key, and nothing for a key that left', () => {
    const { result, rerender } = arrivals([BLOCKER])
    rerender({ messages: [BLOCKER, CUE] })
    expect(result.current).toEqual({ arrivalSeq: 1, openingSeq: 0 })
    rerender({ messages: [BLOCKER] })
    expect(result.current.arrivalSeq).toBe(1)
    // One blocker giving way to another is a new line, with the count unchanged.
    rerender({ messages: [line('blocker:polygon')] })
    expect(result.current.arrivalSeq).toBe(2)
  })

  it('opens the list for each check or basemap failure that arrives', () => {
    const { result, rerender } = arrivals([])
    rerender({ messages: [FIRE] })
    expect(result.current).toEqual({ arrivalSeq: 1, openingSeq: 1 })
    rerender({ messages: [FIRE, CLOSURE, MAP] })
    expect(result.current).toEqual({ arrivalSeq: 2, openingSeq: 2 })
    // Gone and back is news again.
    rerender({ messages: [CLOSURE, MAP] })
    rerender({ messages: [CLOSURE, MAP, FIRE] })
    expect(result.current).toEqual({ arrivalSeq: 3, openingSeq: 3 })
  })

  it('counts nothing for a render that changes no key', () => {
    const { result, rerender } = arrivals([CUE])
    rerender({ messages: [{ ...CUE, text: 'Reworded.' }] })
    expect(result.current).toEqual({ arrivalSeq: 0, openingSeq: 0 })
  })
})
