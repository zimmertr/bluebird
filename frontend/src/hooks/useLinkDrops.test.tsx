import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { type LinkDropInputs, useLinkDrops } from './useLinkDrops'

// What a link lost, until the reader supplies it (#803, M6). Which lines the
// panel says for it is `panelMessages.test.ts`.
const inputs = (over: Partial<LinkDropInputs> = {}): LinkDropInputs => ({
  dropped: ['ring', 'list'],
  ring: false,
  list: false,
  modelLost: false,
  ...over,
})

const hook = (over: Partial<LinkDropInputs> = {}) =>
  renderHook((p: LinkDropInputs) => useLinkDrops(p), { initialProps: inputs(over) })

describe('useLinkDrops', () => {
  it('holds what the decoder dropped, and nothing for a link that restored whole', () => {
    expect(hook().result.current).toEqual(['ring', 'list'])
    expect(hook({ dropped: [] }).result.current).toEqual([])
  })

  // A drawn ring clears the ring's line, and clearing that ring later is the
  // reader's own edit: the link's loss does not come back.
  it('lets the ring go once the reader draws one, for good', () => {
    const { result, rerender } = hook()
    rerender(inputs({ ring: true }))
    expect(result.current).toEqual(['list'])
    rerender(inputs({ ring: false }))
    expect(result.current).toEqual(['list'])
  })

  it('lets the list go once the reader pastes one', () => {
    const { result, rerender } = hook()
    rerender(inputs({ list: true }))
    expect(result.current).toEqual(['ring'])
  })

  // The model's flag is `useForecastSelection`'s: raised by the decoder or by
  // the published list, and lowered by a pick. This only carries it.
  it('carries the model while the selection says it is lost', () => {
    const { result, rerender } = hook({ dropped: ['model'], modelLost: true })
    expect(result.current).toEqual(['model'])
    rerender(inputs({ dropped: ['model'], modelLost: false }))
    expect(result.current).toEqual([])
  })

  // The memoized panel reads it, so an unrelated render keeps its identity.
  it('keeps its identity across a render that changes nothing', () => {
    const { result, rerender } = hook()
    const first = result.current
    rerender(inputs())
    expect(result.current).toBe(first)
  })
})
