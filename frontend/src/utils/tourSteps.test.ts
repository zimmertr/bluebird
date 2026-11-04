import { describe, expect, it } from 'vitest'
import { anchorSelector, stepLayout, TOUR_ATTR, TOUR_STEPS, TUTORIAL_PATH } from './tourSteps'
// `?raw` reads each component as text, so the suite proves every anchor is a
// real control without rendering one: the app's own idiom (`styles.test.ts`).
import appSource from '../App.tsx?raw'
import searchBoxSource from '../components/SearchBox.tsx?raw'
import mapStageSource from '../components/MapStage.tsx?raw'
import destinationsSource from '../components/DestinationsSection.tsx?raw'
import forecastSectionSource from '../components/ForecastSection.tsx?raw'
import metricsTableSource from '../components/MetricsTable.tsx?raw'
import panelFooterSource from '../components/PanelFooter.tsx?raw'
import phoneFootSource from '../components/PhoneFoot.tsx?raw'
import messageBadgeSource from '../components/MessageBadge.tsx?raw'
import messageListSource from '../components/MessageList.tsx?raw'
import layersPopoverSource from '../components/LayersPopover.tsx?raw'
import resultsSheetSource from '../components/ResultsSheet.tsx?raw'
import timeSeriesChartSource from '../components/TimeSeriesChart.tsx?raw'
import chartLayoutButtonSource from '../components/ChartLayoutButton.tsx?raw'
import resultsLayerSource from '../map/resultsLayer.ts?raw'
import welcomeSource from '../components/WelcomeModal.tsx?raw'
import backendMain from '../../../backend/app/main.py?raw'

const SOURCES: Record<string, string> = {
  'App.tsx': appSource,
  'SearchBox.tsx': searchBoxSource,
  'MapStage.tsx': mapStageSource,
  'DestinationsSection.tsx': destinationsSource,
  'ForecastSection.tsx': forecastSectionSource,
  'MetricsTable.tsx': metricsTableSource,
  'PanelFooter.tsx': panelFooterSource,
  'PhoneFoot.tsx': phoneFootSource,
  'MessageBadge.tsx': messageBadgeSource,
  'MessageList.tsx': messageListSource,
  'LayersPopover.tsx': layersPopoverSource,
  'ResultsSheet.tsx': resultsSheetSource,
  'TimeSeriesChart.tsx': timeSeriesChartSource,
  'ChartLayoutButton.tsx': chartLayoutButtonSource,
  'resultsLayer.ts': resultsLayerSource,
  'WelcomeModal.tsx': welcomeSource,
}

const occurrences = (anchor: string): string[] =>
  Object.entries(SOURCES).flatMap(([name, text]) => {
    // Set in JSX, or from script on an element MapLibre owns (the popup).
    const n = text.split(`${TOUR_ATTR}="${anchor}"`).length - 1 + text.split(`'${TOUR_ATTR}', '${anchor}'`).length - 1
    return Array<string>(n).fill(name)
  })

describe('the tutorial steps', () => {
  it('has twelve steps, each with a distinct anchor', () => {
    expect(TOUR_STEPS).toHaveLength(12)
    expect(new Set(TOUR_STEPS.map((s) => s.anchor)).size).toBe(TOUR_STEPS.length)
  })

  it('marks every anchor on exactly one control in one component', () => {
    for (const step of TOUR_STEPS) {
      // The one anchor with a home per width (record 0141): the footer at a
      // desk, the map's button on a phone, where the footer draws none.
      if (step.anchor === 'analyze') {
        expect(occurrences('analyze')).toEqual(['PhoneFoot.tsx'])
        expect(panelFooterSource).toContain(`${TOUR_ATTR}={phone ? undefined : 'analyze'}`)
        continue
      }
      expect(occurrences(step.anchor), step.anchor).toHaveLength(1)
      for (const frame of step.frames ?? []) expect(occurrences(frame), frame).toHaveLength(1)
      if (step.keepClear) expect(occurrences(step.keepClear), step.keepClear).toHaveLength(1)
    }
  })

  // The three chart cards after Chart mark the chart's own sources (#850):
  // the row with the +, the layout button and its menu, and the pinned
  // cards' layer.
  it('marks the chart cards on the chart and its layout button', () => {
    expect(occurrences('chart-panels')).toEqual(['TimeSeriesChart.tsx'])
    expect(occurrences('chart-pins')).toEqual(['TimeSeriesChart.tsx'])
    expect(occurrences('chart-layout')).toEqual(['ChartLayoutButton.tsx'])
    expect(occurrences('chart-layout-menu')).toEqual(['ChartLayoutButton.tsx'])
  })

  it('frames the layout menu with its button, and keeps the card off the panels', () => {
    const at = (anchor: string) => TOUR_STEPS.find((s) => s.anchor === anchor)!
    expect(at('chart-layout').frames).toEqual(['chart-layout-menu'])
    expect(at('chart-panels').keepClear).toBe('chart')
    expect(at('chart-layout').keepClear).toBe('chart')
    expect(TOUR_STEPS.filter((s) => s.keepClear).map((s) => s.anchor)).toEqual(['chart-panels', 'chart-layout'])
  })

  // A phone stacks its panels and pins nothing, so two of the three are a
  // desk's alone (#850), and the tour leaves them out on a phone.
  it('marks the layout and pins cards as a desk\'s alone', () => {
    expect(TOUR_STEPS.filter((s) => s.deskOnly).map((s) => s.anchor)).toEqual(['chart-layout', 'chart-pins'])
  })

  it('lights only what shows of the popup above the results sheet', () => {
    const anchors = new Set(TOUR_STEPS.map((s) => s.anchor))
    for (const step of TOUR_STEPS) if (step.under) expect(anchors.has(step.under), step.anchor).toBe(true)
    expect(TOUR_STEPS.find((s) => s.anchor === 'marker')?.under).toBe('results')
  })

  it('frames the Layers menu with its button, since the menu does not grow the button', () => {
    expect(TOUR_STEPS.find((s) => s.anchor === 'layers')?.frames).toEqual(['layers-menu'])
  })

  it('frames the message list with the count that opens it', () => {
    expect(TOUR_STEPS.find((s) => s.anchor === 'messages')?.frames).toEqual(['messages-list'])
  })

  it('carries the approved copy, in sentence case and without an em dash', () => {
    for (const step of TOUR_STEPS) {
      expect(step.text.endsWith('.'), step.anchor).toBe(true)
      expect(step.text).not.toContain('—')
      expect(step.title).not.toMatch(/\b[A-Z][a-z]+ [A-Z]/)
    }
  })

  it('walks the panel top to bottom, then the map, then the results', () => {
    const anchors = TOUR_STEPS.map((s) => s.anchor)
    expect(anchors).toEqual([
      'destinations',
      'forecast',
      'metrics',
      'analyze',
      'messages',
      'layers',
      'results',
      'chart',
      'chart-panels',
      'chart-layout',
      'chart-pins',
      'marker',
    ])
    expect(TOUR_STEPS[0].text).toMatch(/^Provide a list of destinations to compare by .*, or drawing a polygon/)
  })

  it('frames the three sections rule to rule, the two surfaces by their box, and a control with breath', () => {
    const spots = Object.fromEntries(TOUR_STEPS.map((s) => [s.anchor, s.spot ?? 'box']))
    expect(spots).toEqual({
      destinations: 'section',
      forecast: 'section',
      metrics: 'section',
      analyze: 'box',
      messages: 'control',
      layers: 'control',
      results: 'box',
      chart: 'box',
      'chart-panels': 'control',
      'chart-layout': 'control',
      'chart-pins': 'box',
      marker: 'control',
    })
  })

  it('names the eight steps that bring their own target on screen', () => {
    const reveals = Object.fromEntries(TOUR_STEPS.map((s) => [s.anchor, s.reveal]))
    expect(reveals).toEqual({
      destinations: undefined,
      forecast: undefined,
      metrics: undefined,
      analyze: undefined,
      messages: 'messages',
      layers: 'layers',
      results: 'results',
      chart: 'chart',
      'chart-panels': 'panels',
      'chart-layout': 'layout',
      'chart-pins': 'pins',
      marker: 'marker',
    })
  })

  // The Messages card's words, picked by the maintainer 2026-10-21 (#786). It
  // lights the badge on the Analyze button, which stands beside that step's
  // control at either width. A phone's Analyze is the map's button, so both
  // steps lower the Controls sheet that would stand over it.
  it('carries the Messages card as approved, after Analyze and where it stands', () => {
    const i = TOUR_STEPS.findIndex((s) => s.anchor === 'messages')
    expect(TOUR_STEPS[i - 1].anchor).toBe('analyze')
    expect(TOUR_STEPS[i].title).toBe('Messages')
    expect(TOUR_STEPS[i].text).toBe(
      'The number on Analyze counts messages about your settings. Select it to read them. While Analyze is greyed out, something must be fixed before it can run, and the messages say what.',
    )
    expect(TOUR_STEPS[i].place).toBe(TOUR_STEPS[i - 1].place)
    expect(TOUR_STEPS[i].place).toBe('map')
  })

  // The Chart card's words, approved by the maintainer 2026-10-14.
  it('carries the Chart card as approved', () => {
    const chart = TOUR_STEPS.find((s) => s.anchor === 'chart')!
    expect(chart.title).toBe('Chart')
    expect(chart.text).toBe("Switch to the chart to compare every destination's forecast hour by hour. Select an hour to read every value at that moment.")
  })

  // The three chart cards' words, approved by the maintainer 2026-11-03
  // (#850), between Chart and Markers in the order a reader meets them.
  it('carries the Panels, Panel layout and Pinned hours cards as approved', () => {
    const i = TOUR_STEPS.findIndex((s) => s.anchor === 'chart')
    expect(TOUR_STEPS.slice(i + 1, i + 4).map((s) => [s.title, s.text])).toEqual([
      ['Panels', 'Add a panel to chart another metric, up to four. Each one reads the same hours, so the metrics line up for comparison.'],
      ['Panel layout', 'Pick a layout to arrange the panels. Drag the gap between two panels to resize them, or double-press it to even them out.'],
      ['Pinned hours', 'Select an hour to pin its reading as a card you can move, size and sort. Pin more hours to compare them side by side.'],
    ])
    expect(TOUR_STEPS[i + 4].anchor).toBe('marker')
    for (const step of TOUR_STEPS.slice(i + 1, i + 4)) expect(step.place).toBe('map')
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

  it('has a path the backend serves the app at, so a link can open the tour', () => {
    expect(TUTORIAL_PATH).toBe('/tutorial')
    expect(backendMain).toContain(`@app.api_route("${TUTORIAL_PATH}"`)
  })
})
