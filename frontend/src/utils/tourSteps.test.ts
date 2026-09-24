import { describe, expect, it } from 'vitest'
import { TOUR_STEPS, stepLayout, tourSelector } from './tourSteps'

// The tutorial lights each step's target by its `data-tour` value, and a step
// whose target is missing is passed over, so a renamed or deleted target would
// shorten the tutorial with no error anywhere. Read the sources instead.
const sources = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function filesWearing(key: string): string[] {
  return Object.entries(sources)
    .filter(([path, text]) => !path.includes('.test.') && text.includes(`data-tour="${key}"`))
    .map(([path]) => path)
}

describe('TOUR_STEPS', () => {
  it('names each target once', () => {
    const keys = TOUR_STEPS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(TOUR_STEPS.map((s) => [s.key]))('finds the %s target in exactly one component', (key) => {
    expect(filesWearing(key)).toHaveLength(1)
  })

  it('shows the demo from the step after Analyze to the end, and never before', () => {
    const analyze = TOUR_STEPS.findIndex((s) => s.key === 'analyze')
    expect(analyze).toBeGreaterThan(0)
    TOUR_STEPS.forEach((step, i) => expect(step.demo, step.key).toBe(i > analyze))
  })

  it('selects by the data-tour attribute', () => {
    expect(tourSelector('search')).toBe('[data-tour="search"]')
  })
})

describe('stepLayout', () => {
  const at = (key: string) => TOUR_STEPS.find((s) => s.key === key)!

  it('keeps the docked panel open for every step on a desktop', () => {
    for (const step of TOUR_STEPS) expect(stepLayout(step, true).drawerOpen, step.key).toBe(true)
  })

  it('opens the phone drawer for the panel and closes it for the map and results', () => {
    expect(stepLayout(at('search'), false).drawerOpen).toBe(false)
    expect(stepLayout(at('map'), false).drawerOpen).toBe(false)
    expect(stepLayout(at('polygon'), false).drawerOpen).toBe(true)
    expect(stepLayout(at('analyze'), false).drawerOpen).toBe(true)
    expect(stepLayout(at('results'), false).drawerOpen).toBe(false)
    expect(stepLayout(at('layers'), false).drawerOpen).toBe(false)
    expect(stepLayout(at('tutorial'), false).drawerOpen).toBe(true)
  })

  it('opens the results for the demo steps alone', () => {
    expect(stepLayout(at('analyze'), false)).toMatchObject({ showResults: false, demo: false })
    expect(stepLayout(at('results'), false)).toMatchObject({ showResults: true, demo: true })
  })
})
