// The tutorial's steps (#536), and where the screen has to stand for each one.
// Pure, apart from the hook that drives them, so the order and the layout rule
// are testable in the node project. Every string here was approved by the
// maintainer (TJ, 2026-09-24); a new or reworded one needs the same.

/** Which part of the screen a step's target lives in. */
export type TourPlace = 'map' | 'panel' | 'results'

export interface TourStep {
  /** The `data-tour` value its target wears. */
  key: string
  title: string
  text: string
  place: TourPlace
  /**
   * Whether the demo analysis is on screen. It arrives after the Analyze step
   * explains the button, since there is nothing in a table, a legend or a
   * player to point at before a report exists.
   */
  demo: boolean
}

export const TOUR_STEPS: readonly TourStep[] = [
  { key: 'search', place: 'map', demo: false, title: 'Search by name', text: 'Type the name of a peak, lake, or trailhead and pick a result to add it.' },
  { key: 'map', place: 'map', demo: false, title: 'Click the map', text: 'Click a labeled peak or lake on the map to add it.' },
  { key: 'polygon', place: 'panel', demo: false, title: 'Draw an area', text: 'Draw a polygon on the map to find every peak, trailhead, or lake inside it.' },
  { key: 'coordinates', place: 'panel', demo: false, title: 'Paste coordinates', text: 'Paste one latitude and longitude per line, with an optional name.' },
  { key: 'model', place: 'panel', demo: false, title: 'Choose a model', text: 'Each weather model covers a different area and reaches a different distance ahead.' },
  { key: 'calendar', place: 'panel', demo: false, title: 'Pick a window', text: 'Choose the days and hours you plan to be out.' },
  { key: 'metrics', place: 'panel', demo: false, title: 'Rank and filter', text: 'Pick the metric to rank by. Set a lowest or highest value to hide destinations outside it.' },
  { key: 'analyze', place: 'panel', demo: false, title: 'Analyze', text: 'Fetch the forecast for every destination and rank them. Next shows an example.' },
  { key: 'results', place: 'results', demo: true, title: 'Ranked results', text: 'Each row is a destination, best first. Click a row to find it on the map.' },
  { key: 'columns', place: 'results', demo: true, title: 'Choose columns', text: 'Choose which columns the table shows.' },
  { key: 'results-mode', place: 'results', demo: true, title: 'Table and chart', text: 'Switch between the table, an hourly chart, or both.' },
  { key: 'download', place: 'results', demo: true, title: 'Download', text: 'Save these results as a CSV file.' },
  { key: 'legend', place: 'map', demo: true, title: 'Colored markers', text: 'Each marker is colored by the ranking metric. The legend shows what each color means.' },
  { key: 'player', place: 'map', demo: true, title: 'Forecast player', text: 'Play the forecast hour by hour to watch conditions change on the map.' },
  { key: 'layers', place: 'map', demo: true, title: 'Map layers', text: 'Add wildfires, smoke, rain radar, snow depth, or a forecast grid to the map.' },
  { key: 'tutorial', place: 'panel', demo: true, title: 'Tutorial', text: 'Open this tutorial again from here at any time.' },
]

/** The card's own controls. */
export const TOUR_COPY = {
  previous: 'Previous',
  next: 'Next',
  done: 'Done',
  progress: '{{current}} of {{total}}',
  close: 'End tutorial',
} as const

export function tourSelector(key: string): string {
  return `[data-tour="${key}"]`
}

/** How the screen has to stand for one step. */
export interface TourLayout {
  drawerOpen: boolean
  /** True opens the results; false leaves them as the reader had them. */
  showResults: boolean
  demo: boolean
}

/**
 * The panel is docked beside the map on a desktop, so it stays open for every
 * step there. On a phone it is a drawer over the map, so a step on the map or
 * the results closes it and a step in the panel opens it.
 */
export function stepLayout(step: TourStep, isDesktop: boolean): TourLayout {
  return {
    drawerOpen: isDesktop || step.place === 'panel',
    showResults: step.demo,
    demo: step.demo,
  }
}
