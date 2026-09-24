import { describe, expect, it } from 'vitest'
import { TOUR_STEPS, stepIndex, stepLayout, tourSelector } from './tourSteps'

// The tutorial lights each step's anchor by its `data-tour` value, so a
// renamed or deleted anchor would stall the tutorial at that step with no
// error anywhere. Read the sources instead.
const sources = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function filesWearing(anchor: string): string[] {
  return Object.entries(sources)
    .filter(([path, text]) => !path.includes('.test.') && text.includes(`data-tour="${anchor}"`))
    .map(([path]) => path)
}

describe('TOUR_STEPS', () => {
  it('names each step once', () => {
    const keys = TOUR_STEPS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each([...new Set([...TOUR_STEPS.map((s) => s.anchor), 'progress'])].map((a) => [a]))(
    'finds the %s anchor in exactly one component',
    (anchor) => {
      expect(filesWearing(anchor)).toHaveLength(1)
    },
  )

  it('acts the inputs out before Analyze and the report after it', () => {
    const analyze = stepIndex('analyze')
    for (const key of ['search', 'map', 'polygon', 'coordinates', 'model', 'calendar', 'metrics']) {
      expect(stepIndex(key), key).toBeLessThan(analyze)
    }
    for (const key of ['layers', 'results', 'row', 'popup', 'legend', 'player', 'columns', 'download']) {
      expect(stepIndex(key), key).toBeGreaterThan(analyze)
    }
  })

  it('ends on the link that opens it again', () => {
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].key).toBe('tutorial')
  })

  it('selects by the data-tour attribute', () => {
    expect(tourSelector('search')).toBe('[data-tour="search"]')
  })
})

describe('stepLayout', () => {
  const at = (key: string) => TOUR_STEPS[stepIndex(key)]

  it('keeps the docked panel open for every step on a desktop', () => {
    for (const step of TOUR_STEPS) expect(stepLayout(step, true, true).drawerOpen, step.key).toBe(true)
  })

  it('opens the phone drawer for the panel and closes it for the map and results', () => {
    expect(stepLayout(at('search'), false, false).drawerOpen).toBe(false)
    expect(stepLayout(at('map'), false, false).drawerOpen).toBe(false)
    expect(stepLayout(at('polygon'), false, false).drawerOpen).toBe(true)
    expect(stepLayout(at('analyze'), false, false).drawerOpen).toBe(true)
    expect(stepLayout(at('results'), false, true).drawerOpen).toBe(false)
    expect(stepLayout(at('layers'), false, true).drawerOpen).toBe(false)
    expect(stepLayout(at('tutorial'), false, true).drawerOpen).toBe(true)
  })

  it('leaves the sheet alone until there is a report', () => {
    for (const step of TOUR_STEPS) expect(stepLayout(step, false, false).collapsed, step.key).toBeNull()
  })

  it.each([true, false])('folds the sheet for a map step and opens it for a results step (desktop %s)', (desktop) => {
    expect(stepLayout(at('popup'), desktop, true).collapsed).toBe(true)
    expect(stepLayout(at('row'), desktop, true).collapsed).toBe(false)
  })

  it('opens the sheet beside the docked panel, and leaves it under the phone drawer', () => {
    expect(stepLayout(at('tutorial'), true, true).collapsed).toBe(false)
    expect(stepLayout(at('tutorial'), false, true).collapsed).toBeNull()
  })
})
