import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePreview } from './usePreview'
import { fakeResponse } from '../testSupport/fixtures'

const HIDDEN = { enabled: false, pr: null, commit: null }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePreview', () => {
  it('shows the preview the deployment describes, and stays hidden when it describes none or the call fails', async () => {
    const preview = { enabled: true, pr: '7', commit: 'abc' }
    const fetch = vi.fn(async () => fakeResponse({ preview }))
    vi.stubGlobal('fetch', fetch)
    const shown = renderHook(() => usePreview())
    expect(shown.result.current).toEqual(HIDDEN)
    await waitFor(() => expect(shown.result.current).toEqual(preview))
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain('/api/config')

    for (const answer of [fakeResponse({}), fakeResponse({ detail: 'x' }, 500)]) {
      const asked = vi.fn(async () => answer)
      vi.stubGlobal('fetch', asked)
      const { result } = renderHook(() => usePreview())
      await waitFor(() => expect(asked).toHaveBeenCalled())
      // Let the answer, or its failure, land before reading the state.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(result.current).toEqual(HIDDEN)
    }
  })
})
