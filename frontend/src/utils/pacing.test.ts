import { describe, expect, it } from 'vitest'
import { paceReducer, paceRemainingS, paceWaitLine } from './pacing'
// `?raw` gives each file's text without executing it, the drift-guard idiom
// metrics.test.ts and useCapabilities.test.ts already use. A hook needs a DOM
// the node-env Vitest has not got, so the rule that every paced fetch reports
// itself is asserted against the source.
import analyzeSource from '../hooks/useAnalyze.ts?raw'
import gridSource from '../hooks/useForecastGrid.ts?raw'
import compareSource from '../hooks/useModelCompare.ts?raw'
import compareSurfaceSource from '../components/ModelCompare.tsx?raw'

// The countdown three fetches share (#394). The hook around it is wiring, so
// everything decidable is decided here, where the node-env Vitest can reach it.

const NOW = Date.parse('2026-09-16T12:00:00Z')

describe('the paced-fetch reducer', () => {
  it('turns the pacer’s duration into a deadline', () => {
    expect(paceReducer(null, { kind: 'pace', seconds: 45, nowMs: NOW })).toBe(NOW + 45_000)
  })

  it('takes the latest word rather than extending the wait', () => {
    // Two batches of one fetch can both be paced. The pacer reports the sleep
    // it is ABOUT to take, so the second report is the true one — adding them
    // would count one wait twice.
    const first = paceReducer(null, { kind: 'pace', seconds: 60, nowMs: NOW })
    const second = paceReducer(first, { kind: 'pace', seconds: 5, nowMs: NOW + 1_000 })
    expect(second).toBe(NOW + 6_000)
  })

  it('clears when the fetch completes', () => {
    const paced = paceReducer(null, { kind: 'pace', seconds: 30, nowMs: NOW })
    expect(paceReducer(paced, { kind: 'clear' })).toBeNull()
  })

  it('clears when the fetch is aborted mid-wait', () => {
    // Abort arrives at the same action: a cancelled analysis and a finished one
    // leave the reader in the same place, with nothing left to wait for.
    const paced = paceReducer(null, { kind: 'pace', seconds: 600, nowMs: NOW })
    expect(paceReducer(paced, { kind: 'clear' })).toBeNull()
  })

  it('stays clear when nothing was waiting', () => {
    // Every caller clears on start and on finish, so a clear over null is the
    // common case; it has to be a no-op rather than a new render.
    expect(paceReducer(null, { kind: 'clear' })).toBeNull()
  })
})

describe('the seconds left on a wait', () => {
  it('rounds a part second up, so a wait nearly over still shows', () => {
    expect(paceRemainingS(NOW + 45_000, NOW)).toBe(45)
    expect(paceRemainingS(NOW + 44_100, NOW)).toBe(45)
  })

  it('expires at the deadline rather than counting past it', () => {
    // Null, not 0. A surface then asks one question instead of two, and a
    // pacer that never reported its resume cannot leave `0s` on screen.
    expect(paceRemainingS(NOW, NOW)).toBeNull()
    expect(paceRemainingS(NOW - 5_000, NOW)).toBeNull()
  })

  it('is null when nothing is waiting', () => {
    expect(paceRemainingS(null, NOW)).toBeNull()
  })
})

describe('the wait line', () => {
  it('is the line the analysis overlay has always shown', () => {
    expect(paceWaitLine(34)).toBe('Open-Meteo quota: resuming in 34s')
  })

  it('says nothing when nothing is waiting', () => {
    expect(paceWaitLine(null)).toBeNull()
    expect(paceWaitLine(0)).toBeNull()
  })
})

// The rule this module exists to hold (#394): a fetch that can be paced says
// so. `useModelCompare` was the third caller of `fetchWeather` and the one
// that passed no `onPace`, so a paced comparison showed the reader nothing and
// read as a hung chart.
describe('every caller of the shared budget', () => {
  const callers: [string, string][] = [
    ['useAnalyze', analyzeSource],
    ['useForecastGrid', gridSource],
    ['useModelCompare', compareSource],
  ]

  it.each(callers)('%s takes its countdown from usePacedFetch', (_name, source) => {
    expect(source).toContain("from './usePacedFetch'")
    expect(source).toContain('usePacedFetch()')
  })

  it.each(callers)('%s hands onPace to the fetch', (_name, source) => {
    expect(source).toMatch(/onPace[,:]/)
  })

  it.each(callers)('%s keeps no deadline of its own', (_name, source) => {
    // One module sets `paceEndMs`. A second copy is how the two that reported
    // a wait drifted from the one that did not.
    expect(source).not.toContain('paceEndMs')
  })

  it('shows the wait on the compare surface', () => {
    expect(compareSurfaceSource).toContain('paceWaitLine')
  })

  // The grid's wait clears on EVERY chunk, not on the first (#432). A chunk in
  // hand is a chunk the pacer let through, so there is no count to weigh and
  // nothing pure to test — which is why the rule is read off the source the
  // way the ones above are.
  it('clears the grid wait on every chunk that lands', () => {
    const chunkLoop = gridSource.match(/for \(let start = 0;[\s\S]*?\n {8}\}/)?.[0] ?? ''
    expect(chunkLoop, 'the chunk loop was not found').toContain('await fetchWeather(')
    expect(chunkLoop).toContain('clearPace()')
    // The clear used to sit in the repaint behind a counter, where the air
    // quality that repaints late reaches it too and only the first call ever
    // fired.
    const repaint = gridSource.match(/function repaint\(\) \{[\s\S]*?\n {4}\}/)?.[0] ?? ''
    expect(repaint, 'the repaint was not found').toContain('pairCells(')
    expect(repaint).not.toContain('clearPace()')
  })
})
