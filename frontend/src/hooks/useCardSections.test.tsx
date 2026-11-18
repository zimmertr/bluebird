import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCardSections } from './useCardSections'
import type { PanelSectionId } from '../utils/controlsSummary'

type Props = { analysisSeq: number; held: PanelSectionId | null }
const start = (initialProps: Props = { analysisSeq: 0, held: null }) =>
  renderHook((p: Props) => useCardSections(p), { initialProps })

// Which section of a desk's controls card is open (#825; record 0305).
describe('useCardSections', () => {
  it('opens on Destinations, where every analysis starts', () => {
    expect(start().result.current.section).toBe('destinations')
  })

  it('opens one section at a time, and collapses the open one on its own press', () => {
    const { result } = start()
    act(() => result.current.toggle('metrics'))
    expect(result.current.section).toBe('metrics')
    act(() => result.current.toggle('metrics'))
    expect(result.current.section).toBeNull()
    act(() => result.current.toggle('forecast'))
    expect(result.current.section).toBe('forecast')
  })

  // The maintainer, 2026-11-16: every section collapses after a successful
  // run. `analysisSeq` moves only when a report commits.
  it('collapses every section when a report commits, and only then', () => {
    const { result, rerender } = start()
    rerender({ analysisSeq: 0, held: null })
    expect(result.current.section).toBe('destinations')
    rerender({ analysisSeq: 1, held: null })
    expect(result.current.section).toBeNull()
    // The reader opens one again, and it stays until the next report.
    act(() => result.current.toggle('metrics'))
    rerender({ analysisSeq: 1, held: null })
    expect(result.current.section).toBe('metrics')
    rerender({ analysisSeq: 2, held: null })
    expect(result.current.section).toBeNull()
  })

  // The tutorial's step shows its section open and gives the reader's back.
  it('shows the section the tutorial holds, and the reader\'s own after it', () => {
    const { result, rerender } = start()
    rerender({ analysisSeq: 0, held: 'metrics' })
    expect(result.current.section).toBe('metrics')
    rerender({ analysisSeq: 0, held: null })
    expect(result.current.section).toBe('destinations')
  })
})
