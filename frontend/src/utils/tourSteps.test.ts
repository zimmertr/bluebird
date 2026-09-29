import { describe, expect, it } from 'vitest'
import {
  TOUR_SECTION_COUNT,
  TOUR_STEPS,
  phoneEdge,
  progressText,
  sectionFill,
  stepIndex,
  stepLayout,
  tourSelector,
} from './tourSteps'

// The tutorial lights each step's anchors by their `data-tour` value, so a
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

const at = (key: string) => TOUR_STEPS[stepIndex(key)]

describe('TOUR_STEPS', () => {
  it('names each step once', () => {
    const keys = TOUR_STEPS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('holds the 22 approved steps in 16 sections', () => {
    expect(TOUR_STEPS).toHaveLength(22)
    expect(TOUR_SECTION_COUNT).toBe(16)
  })

  // The anchors the actions reach for as well as the ones a card lights.
  const anchors = [...new Set([...TOUR_STEPS.flatMap((s) => s.anchors), 'map', 'progress'])]
  it.each(anchors.map((a) => [a]))('finds the %s anchor in exactly one component', (anchor) => {
    expect(filesWearing(anchor)).toHaveLength(1)
  })

  it('acts the inputs out before Analyze and the report after it', () => {
    const analyze = stepIndex('analyze')
    for (const key of ['search', 'map-click', 'map-add', 'draw-start', 'draw-corners', 'draw-done', 'paste', 'model-pick', 'model-rank', 'window-day', 'window-hours', 'metrics']) {
      expect(stepIndex(key), key).toBeLessThan(analyze)
    }
    for (const key of ['layers', 'results', 'bound', 'row', 'popup', 'legend', 'player', 'tools']) {
      expect(stepIndex(key), key).toBeGreaterThan(analyze)
    }
  })

  it('ends on the link that opens it again', () => {
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].key).toBe('tutorial')
  })

  it('selects by the data-tour attribute', () => {
    expect(tourSelector('search')).toBe('[data-tour="search"]')
  })

  it('refuses a step it does not have', () => {
    expect(() => stepIndex('nothing')).toThrow()
  })
})

describe('the card\'s progress', () => {
  it('counts inside the section, one of one where a section has one step', () => {
    expect(progressText(at('search'))).toBe('1 of 1')
    expect(progressText(at('draw-start'))).toBe('1 of 3')
    expect(progressText(at('draw-done'))).toBe('3 of 3')
    expect(progressText(at('model-rank'))).toBe('2 of 2')
  })

  it('shows the section title above the text', () => {
    expect(at('draw-corners').section).toBe('Draw an area')
    expect(at('bound').section).toBe('Ranked results')
  })

  it('fills the sections passed, the current one to the step, and none after', () => {
    const fill = sectionFill(at('draw-corners'))
    expect(fill).toHaveLength(TOUR_SECTION_COUNT)
    expect(fill.slice(0, 2)).toEqual([1, 1])
    expect(fill[2]).toBeCloseTo(2 / 3)
    expect(fill.slice(3).every((f) => f === 0)).toBe(true)
    expect(sectionFill(TOUR_STEPS[TOUR_STEPS.length - 1]).every((f) => f === 1)).toBe(true)
  })
})

describe('stepLayout', () => {
  it('keeps the docked panel open for every step on a desktop', () => {
    for (const step of TOUR_STEPS) expect(stepLayout(step, true, true).drawerOpen, step.key).toBe(true)
  })

  it('opens the phone drawer for the panel and closes it for the map and results', () => {
    expect(stepLayout(at('search'), false, false).drawerOpen).toBe(false)
    expect(stepLayout(at('map-click'), false, false).drawerOpen).toBe(false)
    expect(stepLayout(at('draw-start'), false, false).drawerOpen).toBe(true)
    expect(stepLayout(at('draw-corners'), false, false).drawerOpen).toBe(false)
    expect(stepLayout(at('analyze'), false, false).drawerOpen).toBe(true)
    expect(stepLayout(at('results'), false, true).drawerOpen).toBe(false)
    expect(stepLayout(at('layers'), false, true).drawerOpen).toBe(false)
    expect(stepLayout(at('tutorial'), false, true).drawerOpen).toBe(true)
  })

  it('shows the whole table in the two steps that light it, and nowhere else', () => {
    const whole = TOUR_STEPS.filter((step) => stepLayout(step, true, true).wholeTable).map((s) => s.key)
    expect(whole).toEqual(['results', 'bound'])
    expect(stepLayout(at('results'), false, false).wholeTable).toBe(false)
  })

  it('leaves the results alone until there are any', () => {
    for (const step of TOUR_STEPS) expect(stepLayout(step, false, false).collapsed, step.key).toBeNull()
  })

  it.each([true, false])('folds the results for a map step and opens them for a results step (desktop %s)', (desktop) => {
    expect(stepLayout(at('popup'), desktop, true).collapsed).toBe(true)
    expect(stepLayout(at('row'), desktop, true).collapsed).toBe(false)
  })

  it('folds the results beside the docked panel, and leaves them under the phone drawer', () => {
    expect(stepLayout(at('tutorial'), true, true).collapsed).toBe(true)
    expect(stepLayout(at('tutorial'), false, true).collapsed).toBeNull()
  })
})

describe('phoneEdge', () => {
  it('stands at the bottom until the results, and at the top from them on', () => {
    const results = stepIndex('results')
    TOUR_STEPS.forEach((step, i) => expect(phoneEdge(i), step.key).toBe(i < results ? 'bottom' : 'top'))
  })
})
