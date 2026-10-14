import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useHeldSheetPx } from './useHeldSheetPx'

// The Controls sheet never unmounts, so the height a drag left it at is put
// back when it shuts, and the next opening starts at its own (#696).
describe('useHeldSheetPx', () => {
  it('holds a dragged height while open and drops it when the sheet shuts', () => {
    const { result, rerender } = renderHook(({ open }) => useHeldSheetPx(open), { initialProps: { open: true } })
    act(() => result.current[1](420))
    expect(result.current[0]).toBe(420)
    rerender({ open: true })
    expect(result.current[0]).toBe(420)
    rerender({ open: false })
    expect(result.current[0]).toBeNull()
    rerender({ open: true })
    expect(result.current[0]).toBeNull()
  })
})
