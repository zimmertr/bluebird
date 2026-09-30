/**
 * The guided tutorial's steps (#536): what each one points at, what it says,
 * and which side of the app it lives on. Pure data, so the suite can prove
 * every anchor is a real control without a page: `tourSteps.test.ts` reads
 * the component sources as text and fails an anchor that appears nowhere, or
 * twice. The copy is TJ's, verbatim (2026-09-29).
 *
 * One card per panel section rather than one per control. A card per control
 * was built and cut the same day: numbered cards read as steps to take in
 * order, so four destination methods read as four things to do, and a lead
 * card saying "or" made the four after it say the list twice.
 */

/** The attribute a component marks its control with. */
export const TOUR_ATTR = 'data-tour'

/**
 * The path that opens the app with the tour running, so a link can start it
 * (TJ, 2026-09-29). Spelled again as the route in `backend/app/main.py` that
 * serves the app's own page there; `tourSteps.test.ts` reads that file.
 */
export const TUTORIAL_PATH = '/tutorial'

export type TourPlace = 'panel' | 'map'

/**
 * What a step has to bring on screen before it can point at it. `layers`
 * opens the Layers menu, so the card frames the choices rather than a button.
 * `results` shows the results sheet over a demonstration report, because a
 * first-visit tour runs before any analysis and the sheet is otherwise empty.
 * `marker` flies to one of that report's markers and opens its popup.
 */
export type TourReveal = 'layers' | 'results' | 'marker'

/**
 * How the spotlight fits its target. `section` runs from the rule above the
 * target to the rule below it, at the target's own width, so the three panel
 * sections light up between the same lines the panel already draws; `box` is
 * the target's own box, for a surface that carries its own edges (the results
 * sheet, the panel footer); `control` is the box with a few pixels of breath,
 * for a control and its menu, or a popup.
 */
export type TourSpot = 'section' | 'box' | 'control'

export interface TourStep {
  /** The `data-tour` value on the target element. */
  anchor: string
  title: string
  text: string
  /** Which side of a phone's layout holds the target: the drawer or the map. */
  place: TourPlace
  /** How the spotlight fits the target; `box` when unsaid. */
  spot?: TourSpot
  /** What the step opens first; its anchor is absent until it does. */
  reveal?: TourReveal
  /**
   * Further anchors the spotlight frames together with the target. The Layers
   * menu is absolutely positioned, so its button's box does not grow to hold
   * it, and a spotlight over the button alone leaves the menu in the dark.
   */
  frames?: readonly string[]
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    anchor: 'destinations',
    spot: 'section',
    title: 'Destinations',
    text: 'Provide a list of destinations to compare by searching by name, selecting a point on the map, pasting exact coordinate pairs, or drawing a polygon to include every peak, trailhead, or lake inside it.',
    place: 'panel',
  },
  {
    anchor: 'forecast',
    spot: 'section',
    title: 'Forecast',
    text: 'Set the weather model and the date and time to forecast. Different models have different strengths and weaknesses.',
    place: 'panel',
  },
  {
    anchor: 'metrics',
    spot: 'section',
    title: 'Metrics',
    text: 'Pick the metric to rank by. Set a lowest or highest value to hide destinations outside it.',
    place: 'panel',
  },
  {
    anchor: 'analyze',
    title: 'Analyze',
    text: 'Fetch the forecast for every destination and rank them.',
    // The whole footer, rule to edge, so it lights up like the sections above.
    place: 'panel',
  },
  {
    anchor: 'layers',
    spot: 'control',
    title: 'Layers',
    text: 'Enable or disable drawing additional information on the map.',
    place: 'map',
    reveal: 'layers',
    frames: ['layers-menu'],
  },
  {
    anchor: 'results',
    title: 'Results',
    text: 'After analysis, the selected destinations are ranked by your chosen metric and constraints.',
    place: 'map',
    reveal: 'results',
  },
  {
    anchor: 'marker',
    spot: 'control',
    title: 'Markers',
    text: 'Select a marker on the map to see a summary of the forecast for that destination.',
    place: 'map',
    reveal: 'marker',
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
