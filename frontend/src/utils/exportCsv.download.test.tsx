import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv } from './exportCsv'
import { csvFilename } from './resultsCsv'

// A .tsx for the DOM project: the download is an anchor the browser clicks,
// which the node project has no document to build. jsdom has no object URLs
// and a click on a link would try to navigate, so both are stood in for, and
// the frame is queued by hand so the test decides when it runs.
describe('downloadCsv', () => {
  const blobs: Blob[] = []
  const clicked: HTMLAnchorElement[] = []
  const frames: FrameRequestCallback[] = []
  const revokeObjectURL = vi.fn()
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }

  beforeEach(() => {
    blobs.length = 0
    clicked.length = 0
    frames.length = 0
    revokeObjectURL.mockClear()
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob)
      return 'blob:probe'
    }
    URL.revokeObjectURL = revokeObjectURL
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Revoked a frame later rather than at once: click() only queues the
  // download, and Safari has cancelled it when the URL went in the same task.
  it('hands the CSV to the browser under the dated file name, and releases the URL a frame later', async () => {
    const now = new Date(2026, 6, 20, 6, 34)
    downloadCsv('Name\r\nProbe\r\n', now)

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe(csvFilename(now))
    expect(clicked[0].href).toBe('blob:probe')
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/csv;charset=utf-8')
    expect(await blobs[0].text()).toBe('Name\r\nProbe\r\n')

    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    frames[0](0)
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:probe')
  })
})
