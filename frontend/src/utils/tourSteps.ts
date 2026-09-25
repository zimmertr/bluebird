// The tutorial's steps (#536), and where the screen has to stand for each one.
// Pure, apart from the chunk that acts them out, so the order and the layout
// rule are testable in the node project. Every string here was approved by the
// maintainer (TJ, 2026-09-24); a new or reworded one needs the same.

/** Which part of the screen a step's target lives in. */
export type TourPlace = 'map' | 'panel' | 'results'

export interface TourStep {
  /** The step's name, which `tour/actions.ts` keys what the step does on. */
  key: string
  /** The `data-tour` value the step lights as it opens. */
  anchor: string
  title: string
  text: string
  place: TourPlace
}

export const TOUR_STEPS: readonly TourStep[] = [
  { key: 'search', anchor: 'search', place: 'map', title: 'Search by name', text: 'Type the name of a destination and select it from the results menu.' },
  { key: 'map', anchor: 'map', place: 'map', title: 'Click the map', text: 'Zoom in, click a peak or lake on the map, and select Add to analysis.' },
  { key: 'polygon', anchor: 'polygon', place: 'panel', title: 'Draw an area', text: 'Draw a polygon on the map to find every peak, trailhead, or lake inside it.' },
  { key: 'coordinates', anchor: 'coordinates', place: 'panel', title: 'Paste coordinates', text: 'Paste one latitude and longitude per line, with an optional name.' },
  { key: 'model', anchor: 'model', place: 'panel', title: 'Choose a model', text: 'Each weather model covers a different area and reaches a different distance ahead.' },
  { key: 'calendar', anchor: 'calendar', place: 'panel', title: 'Pick a window', text: 'Choose the days and hours you plan to be out.' },
  { key: 'metrics', anchor: 'metrics', place: 'panel', title: 'Rank and filter', text: 'Pick the metric to rank by. Set a lowest or highest value to hide destinations outside it.' },
  { key: 'analyze', anchor: 'analyze', place: 'panel', title: 'Analyze', text: 'Fetch the forecast for every destination and rank them. This tutorial uses example data.' },
  { key: 'layers', anchor: 'layers', place: 'map', title: 'Wildfires and smoke', text: 'Turn on wildfires and smoke to see where the air is bad.' },
  { key: 'results', anchor: 'results', place: 'results', title: 'Ranked results', text: 'Ranked by air quality, the peaks far from the fire come first.' },
  { key: 'row', anchor: 'results', place: 'results', title: 'Find it on the map', text: 'Click a row to fly to that destination and open its forecast.' },
  { key: 'popup', anchor: 'map', place: 'map', title: 'Forecast details', text: 'Click any number to see that forecast on Windy.' },
  { key: 'legend', anchor: 'legend', place: 'map', title: 'Colored markers', text: 'Each marker is colored by the ranking metric. The legend shows what each color means.' },
  { key: 'player', anchor: 'player', place: 'map', title: 'Forecast player', text: 'Play the forecast hour by hour to watch conditions change on the map.' },
  { key: 'columns', anchor: 'columns', place: 'results', title: 'Choose columns', text: 'Choose which columns the table shows.' },
  { key: 'results-mode', anchor: 'results-mode', place: 'results', title: 'Table and chart', text: 'Switch between the table, an hourly chart, or both.' },
  { key: 'download', anchor: 'download', place: 'results', title: 'Download', text: 'Save these results as a CSV file.' },
  { key: 'tutorial', anchor: 'tutorial', place: 'panel', title: 'Tutorial', text: 'Open this tutorial again from here at any time.' },
]

/** The card's own controls. */
export const TOUR_COPY = {
  previous: 'Previous',
  next: 'Next',
  done: 'Done',
  progress: '{{current}} of {{total}}',
  close: 'End tutorial',
} as const

export function tourSelector(anchor: string): string {
  return `[data-tour="${anchor}"]`
}

/** The index of the step named `key`. */
export function stepIndex(key: string): number {
  return TOUR_STEPS.findIndex((s) => s.key === key)
}

/** How the screen has to stand for one step. */
export interface TourLayout {
  drawerOpen: boolean
  /** Null leaves the sheet as it stands; true or false collapses it or not. */
  collapsed: boolean | null
}

/**
 * The panel is docked beside the map on a desktop, so it stays open for every
 * step there. On a phone it is a drawer over the map, so a step on the map or
 * the results closes it and a step in the panel opens it.
 *
 * Once there is a report, a map step folds the results down to their bar, so
 * a popup or the player has the whole map to stand on, and a results step
 * opens them back up. A panel step leaves them as they are on a phone, where
 * the drawer covers them, and open on a desktop, where they sit beside it.
 */
export function stepLayout(step: TourStep, isDesktop: boolean, hasReport: boolean): TourLayout {
  const collapsed = !hasReport
    ? null
    : step.place === 'map'
      ? true
      : step.place === 'results' || isDesktop
        ? false
        : null
  return { drawerOpen: isDesktop || step.place === 'panel', collapsed }
}
