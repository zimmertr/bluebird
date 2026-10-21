import { describe, expect, it } from 'vitest'
import ModelCompare from './ModelCompare'
import type { ComparedModel } from '../hooks/useModelCompare'
import { render } from '../testSupport/render'

const model = (id: string, note: string | null): ComparedModel => ({ id, label: id, note })

describe('ModelCompare', () => {
  it('says nothing with no notes and no wait, and puts the quota wait above the model notes', () => {
    const quiet = [model('gfs_seamless', null), model('icon_seamless', null)]
    for (const paceRemainingS of [null, 0]) {
      const { container, unmount } = render(<ModelCompare compared={quiet} paceRemainingS={paceRemainingS} />)
      expect(container.innerHTML).toBe('')
      unmount()
    }

    const compared = [model('gfs_seamless', null), model('icon_seamless', 'DWD ICON note'), model('gfs_hrrr', 'NOAA HRRR note')]
    const { container } = render(<ModelCompare compared={compared} paceRemainingS={12} />)
    const lines = [...container.firstElementChild!.children].map((line) => line.textContent)
    expect(lines).toEqual(['Open-Meteo quota · resuming in 12s', 'DWD ICON note', 'NOAA HRRR note'])
  })
})
