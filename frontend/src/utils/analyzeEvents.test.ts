import { describe, it, expect } from 'vitest'
import { drainSseBuffer } from './analyzeEvents'

describe('drainSseBuffer', () => {
  it('parses every complete event in a chunk', () => {
    const { events, rest } = drainSseBuffer(
      'data: {"type": "status", "message": "Searching for Destinations…"}\n\n' +
        'data: {"type": "progress", "processed": 0, "total": 2, "percent": 0}\n\n'
    )
    expect(events).toEqual([
      { type: 'status', message: 'Searching for Destinations…' },
      { type: 'progress', processed: 0, total: 2, percent: 0 },
    ])
    expect(rest).toBe('')
  })

  it('keeps an unfinished event as the remainder for the next chunk', () => {
    const { events, rest } = drainSseBuffer(
      'data: {"type": "status", "message": "a"}\n\ndata: {"type": "resu'
    )
    expect(events).toEqual([{ type: 'status', message: 'a' }])
    expect(rest).toBe('data: {"type": "resu')
    // ...and the remainder completes cleanly once the rest arrives.
    const next = drainSseBuffer(rest + 'lt", "data": {"results": [], "total_queried": 0}}\n\n')
    expect(next.events[0].type).toBe('result')
    expect(next.rest).toBe('')
  })

  it('carries the optional failover detail on status events', () => {
    const { events } = drainSseBuffer(
      'data: {"type": "status", "message": "Searching for Destinations…", ' +
        '"detail": "Trying backup map server 2 of 3…"}\n\n'
    )
    expect(events[0].detail).toBe('Trying backup map server 2 of 3…')
  })

  it('skips malformed frames without dropping the ones around them', () => {
    const { events } = drainSseBuffer(
      'data: {"type": "status"}\n\ndata: {not json}\n\nretry: 100\n\ndata: {"type": "result"}\n\n'
    )
    expect(events.map((e) => e.type)).toEqual(['status', 'result'])
  })
})
