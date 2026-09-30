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

  it('opens the phone drawer at the bound step, whose field is in it', () => {
    expect(stepLayout(at('bound'), false, true).drawerOpen).toBe(true)
    expect(stepLayout(at('row'), false, true).drawerOpen).toBe(false)
  })

  it('shows the whole table in the steps about it, and nowhere else', () => {
    const whole = TOUR_STEPS.filter((step) => stepLayout(step, true, true).wholeTable).map((s) => s.key)
    expect(whole).toEqual(['results', 'bound', 'row'])
    expect(stepLayout(at('results'), false, false).wholeTable).toBe(false)
  })

  it.each([true, false])('folds the results in every other step, before any exist too (desktop %s)', (desktop) => {
    const open = TOUR_STEPS.filter((step) => !stepLayout(step, desktop, true).collapsed).map((s) => s.key)
    expect(open).toEqual(['results', 'bound', 'row'])
    expect(stepLayout(at('search'), desktop, false).collapsed).toBe(true)
    // The results tools are in the bar, so the tools step does not open them.
    expect(stepLayout(at('tools'), desktop, true).collapsed).toBe(true)
  })
})

describe('phoneEdge', () => {
  it('stands at the top for the steps that light the results sheet or the player, and the last', () => {
    const top = TOUR_STEPS.filter((_, i) => phoneEdge(i) === 'top').map((s) => s.key)
    expect(top).toEqual(['results', 'bound', 'row', 'player', 'tools', 'tutorial'])
  })

  it('stands at the bottom for the popup and the legend, which need the map under the chrome', () => {
    for (const key of ['popup', 'legend']) expect(phoneEdge(stepIndex(key)), key).toBe('bottom')
  })
})
