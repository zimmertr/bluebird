import { describe, expect, it } from 'vitest'
import { anchorSelector, stepLayout, TOUR_ATTR, TOUR_STEPS } from './tourSteps'
// `?raw` reads each component as text, so the suite proves every anchor is a
// real control without rendering one: the app's own idiom (`styles.test.ts`).
import appSource from '../App.tsx?raw'
import searchBoxSource from '../components/SearchBox.tsx?raw'
import mapStageSource from '../components/MapStage.tsx?raw'
import destinationsSource from '../components/DestinationsSection.tsx?raw'
import forecastSectionSource from '../components/ForecastSection.tsx?raw'
import metricsTableSource from '../components/MetricsTable.tsx?raw'
import panelFooterSource from '../components/PanelFooter.tsx?raw'
import layersPopoverSource from '../components/LayersPopover.tsx?raw'
import welcomeSource from '../components/WelcomeModal.tsx?raw'

const SOURCES: Record<string, string> = {
  'App.tsx': appSource,
  'SearchBox.tsx': searchBoxSource,
  'MapStage.tsx': mapStageSource,
  'DestinationsSection.tsx': destinationsSource,
  'ForecastSection.tsx': forecastSectionSource,
  'MetricsTable.tsx': metricsTableSource,
  'PanelFooter.tsx': panelFooterSource,
  'LayersPopover.tsx': layersPopoverSource,
  'WelcomeModal.tsx': welcomeSource,
}

const occurrences = (anchor: string): string[] =>
  Object.entries(SOURCES).flatMap(([name, text]) => {
    const n = text.split(`${TOUR_ATTR}="${anchor}"`).length - 1
    return Array<string>(n).fill(name)
  })

describe('the tutorial steps', () => {
  it('has seven steps, each with a distinct anchor', () => {
    expect(TOUR_STEPS).toHaveLength(7)
    expect(new Set(TOUR_STEPS.map((s) => s.anchor)).size).toBe(TOUR_STEPS.length)
  })

  it('marks every anchor on exactly one control in one component', () => {
    for (const step of TOUR_STEPS) {
      expect(occurrences(step.anchor), step.anchor).toHaveLength(1)
    }
  })

  it('carries the approved copy, in sentence case and without an em dash', () => {
    for (const step of TOUR_STEPS) {
      expect(step.text.endsWith('.'), step.anchor).toBe(true)
      expect(step.text).not.toContain('—')
      expect(step.title).not.toMatch(/\b[A-Z][a-z]+ [A-Z]/)
    }
    expect(TOUR_STEPS.find((s) => s.anchor === 'analyze')?.text).not.toContain('example data')
  })

  it('says the four destination methods once, as options, in one card', () => {
    const anchors = TOUR_STEPS.map((s) => s.anchor)
    expect(anchors).toEqual(['destinations', 'model', 'calendar', 'metrics', 'analyze', 'layers', 'tutorial'])
    expect(TOUR_STEPS[0].text).toMatch(/^Provide a list of destinations to compare by .*, or drawing a polygon/)
  })

  it('names a selector from the anchor attribute', () => {
    expect(anchorSelector('search')).toBe('[data-tour="search"]')
  })

  it('leaves the drawer alone on desktop and opens it for a panel step on a phone', () => {
    const panel = TOUR_STEPS.find((s) => s.place === 'panel')!
    const map = TOUR_STEPS.find((s) => s.place === 'map')!
    expect(stepLayout(panel, true)).toEqual({ drawerOpen: null })
    expect(stepLayout(map, true)).toEqual({ drawerOpen: null })
    expect(stepLayout(panel, false)).toEqual({ drawerOpen: true })
    expect(stepLayout(map, false)).toEqual({ drawerOpen: false })
  })

  it('offers the tour from the welcome dialog and the panel footer', () => {
    expect(welcomeSource).toContain('Take the tutorial')
    expect(panelFooterSource).toContain('>\n          Tutorial\n')
  })
})
