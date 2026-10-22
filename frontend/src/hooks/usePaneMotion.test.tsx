import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHeldWhile, usePaneMotion } from './usePaneMotion'

type Props = { shown: boolean; px: number; animated: boolean }
const start = (initialProps: Props) =>
  renderHook(({ shown, px, animated }: Props) => usePaneMotion(shown, px, animated), { initialProps })

// A results pane at a desk opens and closes over the panel's speed. Its body
// is mounted the first time the pane is shown and stays mounted while the
// pane is shut, at the height it last had, so a press opens a frame around a
// body already drawn (#714, #786; records 0202, 0216).
describe('usePaneMotion', () => {
  it('starts as it is shown', () => {
    expect(start({ shown: true, px: 220, animated: true }).result.current).toMatchObject({ mounted: true, open: true, px: 220 })
    expect(start({ shown: false, px: 0, animated: true }).result.current).toMatchObject({ mounted: false, open: false })
  })

  // TJ on 2026-10-21: "The data should be shown as the results area is
  // growing."
  it('mounts a shown pane\'s body at the press, at the height it will stand at, and opens its frame', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: true, px: 220 })
  })

  it('shuts a hidden pane at once and keeps its body, at the height it had', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    // Hidden, the layout gives the pane no height at all.
    rerender({ shown: false, px: 0, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: false, px: 220 })
  })

  it('opens a pane again around the body it kept, at the height the layout gives it now', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 260, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: true, px: 260 })
  })

  it('keeps the body of a pane hidden again before its frame had opened', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: false, px: 220 })
  })

  it('follows a drag while shown', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: true, px: 260, animated: true })
    expect(result.current.px).toBe(260)
  })

  it('mounts a phone\'s pane only while it is shown', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: false })
    rerender({ shown: false, px: 0, animated: false })
    expect(result.current).toMatchObject({ mounted: false, open: false })
    rerender({ shown: true, px: 220, animated: false })
    expect(result.current).toMatchObject({ mounted: true, open: true })
  })
})

describe('useHeldWhile', () => {
  it('follows its value, and holds the last one while told to', () => {
    const { result, rerender } = renderHook(({ value, holding }) => useHeldWhile(value, holding), {
      initialProps: { value: 'chart', holding: false },
    })
    rerender({ value: 'both', holding: false })
    expect(result.current).toBe('both')
    rerender({ value: 'table', holding: true })
    expect(result.current).toBe('both')
    rerender({ value: 'table', holding: false })
    expect(result.current).toBe('table')
  })
})
