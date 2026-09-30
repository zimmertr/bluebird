/**
 * The guided tutorial's steps (#536): what each one points at, what it says,
 * and which side of the app it lives on. Pure data, so the suite can prove
 * every anchor is a real control without a page: `tourSteps.test.ts` reads
 * the component sources as text and fails an anchor that appears nowhere, or
 * twice. The copy is TJ's approved list, verbatim; a step that names a
 * control the screen does not hold is skipped when the tour starts, which is
 * why the results steps are not here yet: a first-visit tour runs over an
 * empty app.
 */

/** The attribute a component marks its control with. */
export const TOUR_ATTR = 'data-tour'

export type TourPlace = 'panel' | 'map'

export interface TourStep {
  /** The `data-tour` value on the target element. */
  anchor: string
  title: string
  text: string
  /** Which side of a phone's layout holds the target: the drawer or the map. */
  place: TourPlace
}

export const TOUR_STEPS: readonly TourStep[] = [
  // The lead card says the four methods after it are options, not a sequence:
  // a numbered run of cards reads as steps to take in order, and the section
  // itself never says "or". The sentence is the welcome dialog's (TJ, A of
  // two options, 2026-09-29).
  {
    anchor: 'destinations',
    title: 'Destinations',
    text: 'Search by name, draw a polygon, click the map, or paste coordinates. Each method finds what you want in its own way; they all work together.',
    place: 'panel',
  },
  {
    anchor: 'search',
    title: 'Search by name',
    text: 'Type the name of a destination and select it from the results menu.',
    place: 'map',
  },
  {
    anchor: 'map',
    title: 'Click the map',
    text: 'Zoom in, click a peak or lake on the map, and select Add to analysis.',
    place: 'map',
  },
  {
    anchor: 'polygon',
    title: 'Draw an area',
    text: 'Draw a polygon on the map to find every peak, trailhead, or lake inside it.',
    place: 'panel',
  },
  {
    anchor: 'coordinates',
    title: 'Paste coordinates',
    text: 'Paste one latitude and longitude per line, with an optional name.',
    place: 'panel',
  },
  {
    anchor: 'model',
    title: 'Choose a model',
    text: 'Each weather model covers a different area and reaches a different distance ahead.',
    place: 'panel',
  },
  {
    anchor: 'calendar',
    title: 'Pick a window',
    text: 'Choose the days and hours you plan to be out.',
    place: 'panel',
  },
  {
    anchor: 'metrics',
    title: 'Rank and filter',
    text: 'Pick the metric to rank by. Set a lowest or highest value to hide destinations outside it.',
    place: 'panel',
  },
  {
    anchor: 'analyze',
    title: 'Analyze',
    text: 'Fetch the forecast for every destination and rank them.',
    place: 'panel',
  },
  {
    anchor: 'layers',
    title: 'Wildfires and smoke',
    text: 'Turn on wildfires and smoke to see where the air is bad.',
    place: 'map',
  },
  {
    anchor: 'tutorial',
    title: 'Tutorial',
    text: 'Open this tutorial again from here at any time.',
    place: 'panel',
  },
]

/**
 * What a step needs of the drawer. On desktop the panel is docked, so nothing
 * moves: `null`. On a phone the panel is a drawer that covers the map, so a
 * panel step needs it open and a map step needs it closed.
 */
export function stepLayout(step: TourStep, isDesktop: boolean): { drawerOpen: boolean | null } {
  if (isDesktop) return { drawerOpen: null }
  return { drawerOpen: step.place === 'panel' }
}

/** The selector that finds a step's target. */
export function anchorSelector(anchor: string): string {
  return `[${TOUR_ATTR}="${anchor}"]`
}
