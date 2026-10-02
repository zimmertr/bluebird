import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { MapViewHandle } from '../components/MapView'
import { useClosePopupsOnCommit } from './useClosePopupsOnCommit'

// Only the one method this hook calls; the rest of the handle is the map's.
function mapRef() {
  const closePopups = vi.fn()
  return { ref: { current: { closePopups } as unknown as MapViewHandle }, closePopups }
}

describe('useClosePopupsOnCommit', () => {
  it('closes nothing before the first report', () => {
    const { ref, closePopups } = mapRef()
    renderHook(() => useClosePopupsOnCommit(0, ref))
    expect(closePopups).not.toHaveBeenCalled()
  })

  it('closes every popup once per committed report, and not on a render between', () => {
    const { ref, closePopups } = mapRef()
    const { rerender } = renderHook((seq: number) => useClosePopupsOnCommit(seq, ref), {
      initialProps: 0,
    })
    rerender(1)
    expect(closePopups).toHaveBeenCalledTimes(1)
    // A live knob re-renders under the same report and leaves the card open.
    rerender(1)
    expect(closePopups).toHaveBeenCalledTimes(1)
    rerender(2)
    expect(closePopups).toHaveBeenCalledTimes(2)
  })

  it('survives a map that has not mounted', () => {
    expect(() => renderHook(() => useClosePopupsOnCommit(1, { current: null }))).not.toThrow()
  })
})
