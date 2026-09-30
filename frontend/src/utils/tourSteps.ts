// The tutorial's steps (#536), in sections, and where the screen has to stand
// for each one. Pure, apart from the chunk that acts them out, so the order,
// the counts the card shows and the layout rule are testable in the node
// project. Every string here was approved by the maintainer (TJ, 2026-09-24
// and 2026-09-29); a new or reworded one needs the same.

/** Which part of the screen a step's target lives in. */
export type TourPlace = 'map' | 'panel' | 'results'

interface StepSpec {
  /** The step's name, which `tour/actions.ts` keys what the step does on. */
  key: string
  /** The `data-tour` values of what the step lights while its card is read. */
  anchors: readonly string[]
  place: TourPlace
  text: string
}

interface SectionSpec {
  title: string
  steps: readonly StepSpec[]
}

// A gesture a reader thinks of as one stays one step, and a section holds the
// steps of one part of the app, so the card can say where in the app the step
// is and how far through that part it has come.
const SECTIONS: readonly SectionSpec[] = [
  {
    title: 'Search by name',
    steps: [{ key: 'search', anchors: ['search'], place: 'map', text: 'Type the name of a destination and select it from the results menu.' }],
  },
  {
    title: 'Click the map',
    steps: [
      { key: 'map-click', anchors: [], place: 'map', text: 'Zoom in and click a peak or lake on the map.' },
      { key: 'map-add', anchors: [], place: 'map', text: 'Select Add to analysis.' },
    ],
  },
  {
    title: 'Draw an area',
    steps: [
      { key: 'draw-start', anchors: ['polygon'], place: 'panel', text: 'Select Draw polygon.' },
      { key: 'draw-corners', anchors: [], place: 'map', text: 'Click the map to place each corner.' },
      { key: 'draw-done', anchors: ['polygon'], place: 'panel', text: 'Select Done, then choose what to find inside the area.' },
    ],
  },
  {
    title: 'Paste coordinates',
    steps: [{ key: 'paste', anchors: ['coordinates'], place: 'panel', text: 'Paste one latitude and longitude per line, with an optional name.' }],
  },
  {
    title: 'Choose a model',
    steps: [
      { key: 'model-pick', anchors: ['model'], place: 'panel', text: 'Each weather model covers a different area and reaches a different distance ahead.' },
      { key: 'model-rank', anchors: ['model'], place: 'panel', text: 'One model ranks the results. The others are compared with it.' },
    ],
  },
  {
    title: 'Pick a window',
    steps: [
      { key: 'window-day', anchors: ['calendar'], place: 'panel', text: 'Choose the days you plan to be out.' },
      { key: 'window-hours', anchors: ['calendar'], place: 'panel', text: 'Select Hourly to set the hours.' },
    ],
  },
  {
    title: 'Rank and filter',
    steps: [{ key: 'metrics', anchors: ['metrics'], place: 'panel', text: 'Pick the metric to rank by. Set a lowest or highest value to hide destinations outside it.' }],
  },
  {
    title: 'Analyze',
    steps: [{ key: 'analyze', anchors: ['analyze'], place: 'panel', text: 'Fetch the forecast for every destination and rank them. This tutorial uses example data.' }],
  },
  {
    title: 'Wildfires and smoke',
    steps: [{ key: 'layers', anchors: ['layers'], place: 'map', text: 'Turn on wildfires and smoke to see where the air is bad.' }],
  },
  {
    title: 'Ranked results',
    steps: [
      { key: 'results', anchors: ['results'], place: 'results', text: 'Ranked by air quality, the peaks far from the fire come first.' },
      { key: 'bound', anchors: ['results'], place: 'results', text: 'Set a highest AQI to hide the destinations in the smoke.' },
    ],
  },
  {
    title: 'Find it on the map',
    steps: [{ key: 'row', anchors: [], place: 'results', text: 'Click a row to fly to that destination and open its forecast.' }],
  },
  {
    title: 'Forecast details',
    steps: [{ key: 'popup', anchors: [], place: 'map', text: 'Click any number to see that forecast on Windy.' }],
  },
  {
    title: 'Colored markers',
    steps: [{ key: 'legend', anchors: ['legend'], place: 'map', text: 'Each marker is colored by the ranking metric. The legend shows what each color means.' }],
  },
  {
    title: 'Forecast player',
    steps: [{ key: 'player', anchors: ['player'], place: 'map', text: 'Play the forecast hour by hour to watch conditions change on the map.' }],
  },
  {
    title: 'Results tools',
    steps: [{ key: 'tools', anchors: ['columns', 'results-mode', 'download'], place: 'results', text: 'Choose the columns, switch between the table and the chart, or download a CSV file.' }],
  },
  {
    title: 'Tutorial',
    steps: [{ key: 'tutorial', anchors: ['tutorial'], place: 'panel', text: 'Open this tutorial again from here at any time.' }],
  },
]

export interface TourStep extends StepSpec {
  /** The section's title, which the card shows above the step's text. */
  section: string
  /** Which section, from 0, for the card's progress bars. */
  sectionIndex: number
  /** Where the step stands in its section, from 0, and how many it holds. */
  inSection: number
  sectionSize: number
}

export const TOUR_SECTION_COUNT = SECTIONS.length

export const TOUR_STEPS: readonly TourStep[] = SECTIONS.flatMap((section, sectionIndex) =>
  section.steps.map((step, inSection) => ({
    ...step,
    section: section.title,
    sectionIndex,
    inSection,
    sectionSize: section.steps.length,
  })),
)

/** The card's own controls. */
export const TOUR_COPY = {
  previous: 'Previous',
  next: 'Next',
  done: 'Done',
  progress: '{{current}} of {{total}}',
  close: 'End tutorial',
} as const

/** The count the card shows, which counts inside the step's section. */
export function progressText(step: TourStep): string {
  return TOUR_COPY.progress
    .replace('{{current}}', String(step.inSection + 1))
    .replace('{{total}}', String(step.sectionSize))
}

/**
 * How far each section's bar is filled while `step` is on screen: a section
 * already passed is full, the step's own section is filled to the step, and
 * the rest are empty.
 */
export function sectionFill(step: TourStep): number[] {
  return Array.from({ length: TOUR_SECTION_COUNT }, (_, i) =>
    i < step.sectionIndex ? 1 : i > step.sectionIndex ? 0 : (step.inSection + 1) / step.sectionSize,
  )
}

export function tourSelector(anchor: string): string {
  return `[data-tour="${anchor}"]`
}

/** The index of the step named `key`. */
export function stepIndex(key: string): number {
  const i = TOUR_STEPS.findIndex((s) => s.key === key)
  if (i < 0) throw new Error(`no tutorial step is named ${key}`)
  return i
}

/** How the screen has to stand for one step. */
export interface TourLayout {
  drawerOpen: boolean
  /** Whether the results are folded down to their bar. */
  collapsed: boolean
  /** The table is sized to show every row it holds, where the room allows. */
  wholeTable: boolean
}

// The steps about the table: the two that light it, and the row step, which
// presses a row in it and folds it as its own action.
const TABLE_STEPS = new Set(['results', 'bound', 'row'])

/**
 * The panel is docked beside the map on a desktop, so it stays open for every
 * step there. On a phone it is a drawer over the map, so a step on the map or
 * the results closes it and a step in the panel opens it. The bound step
 * opens it too: its card is about the highest-AQI field in it, and its action
 * closes the drawer to show the rows leave.
 *
 * The results hold one state for as long as they can, since each change moves
 * the map. They are folded to their bar in every step but the three about the
 * table, from before the first place is named, so the bar a search brings
 * arrives folded. The steps about the table open them, and all of the table
 * shows: the ranking is the point of those steps, and its worst rows are at
 * the bottom. The row step folds them as the map flies to its row, and they
 * stay folded to the end; the results tools are in the bar.
 */
export function stepLayout(step: TourStep, isDesktop: boolean, hasResults: boolean): TourLayout {
  const table = TABLE_STEPS.has(step.key)
  return {
    drawerOpen: isDesktop || step.place === 'panel' || step.key === 'bound',
    collapsed: !table,
    wholeTable: hasResults && table,
  }
}

/** Which edge of a phone the card stands on. */
export type PhoneEdge = 'top' | 'bottom'

// The steps whose card stands at the top of a phone: the ones that light the
// results sheet or the player riding on it, both on the map's bottom edge;
// the popup the row step opens, which the row step placed clear of a card at
// the top, so the card does not move between them; and the last, in the
// drawer beside them.
const TOP_EDGE = new Set(['results', 'bound', 'row', 'popup', 'player', 'tools', 'tutorial'])

/**
 * The card stands at the bottom of a phone, over the map's bottom edge,
 * wherever a step is about the map or the panel: the map's own chrome is
 * across its top, and a popup or a ring needs the height between the two. It
 * stands at the top for the steps that light the results sheet or the player,
 * which stand on that bottom edge. The card changes edge only as a new card
 * appears, never in the middle of a step, so the row step's press on the table
 * keeps the top, and so does the next step, about the popup it opened.
 */
export function phoneEdge(index: number): PhoneEdge {
  return TOP_EDGE.has(TOUR_STEPS[index]?.key ?? '') ? 'top' : 'bottom'
}
