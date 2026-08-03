import { useDialog } from '../hooks/useDialog'
import SafetyNotice from './SafetyNotice'
import { BADGE_STEP, BUTTON_PRIMARY, LAYER, PROSE, RADIUS, SURFACE_CARD } from '../styles'

interface Props {
  onDismiss: () => void
}

// Five steps matching the panel's four sections plus the Analyze button and what
// comes after. A reader arrives here and then looks at the panel, so each step
// that matches a panel section naming makes following the walkthrough clear.
const STEPS: [string, string][] = [
  ['Destinations', 'Search by name, draw a polygon, click the map, or paste coordinates. Each method finds what you want in its own way; they all work together.'],
  ['Forecast', 'Pick a weather model, then choose a day and time window. The calendar updates as the model changes, since different models reach different distances ahead.'],
  ['Results', 'Rank by precipitation, wind, temperature, or air quality. Filter by elevation or those same metrics. Choose how many destinations to list, and pick which forecast values and which detail to show.'],
  ['Analyze', 'Generate ranked results, see them on the map as color-coded markers, and inspect forecasts across your destinations.'],
  ['Repeat', 'Adjust any control to refine your window. Changing destinations, the forecast window, or the model needs a new Analyze; everything else updates live.'],
]

export default function WelcomeModal({ onDismiss }: Props) {
  const panelRef = useDialog(onDismiss)
  return (
    <div className={`fixed inset-0 ${LAYER.modal} flex items-center justify-center bg-black/60 backdrop-blur-sm p-4`}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className={`${SURFACE_CARD} w-full max-w-md max-h-full overflow-y-auto focus:outline-none`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700">
          <img src="/icon.png" alt="" className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`} />
          <div>
            <h1 id="welcome-title" className={PROSE.title}>Welcome to Bluebird Forecast</h1>
            <p className={PROSE.subtitle}>The Weather Window Finder</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className={`${PROSE.body} mb-4`}>
            It's Friday evening. Rain is moving in from the west, smoke is drifting from the east,
            and strong winds are building to the south. You want to get outside this weekend, but
            where should you go?
          </p>

          <h2 className={`${PROSE.heading} mb-3`}>How it works</h2>

          {/* Steps */}
          <ol className="space-y-3 mb-5">
            {STEPS.map(([title, desc], i) => (
              <li key={i} className={`${PROSE.body} flex gap-3`}>
                <span className={`flex-shrink-0 w-5 h-5 ${RADIUS.pill} ${BADGE_STEP} flex items-center justify-center mt-0.5`}>
                  {i + 1}
                </span>
                <p className="leading-snug">
                  <span className={PROSE.strong}>{title}</span>
                  {': '}
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          <p className={`${PROSE.note} mb-4`}>
            <SafetyNotice />
          </p>

          <div className="border-t border-slate-700 pt-4 mb-4">
            <p className={`${PROSE.heading} text-center`}>
              Ready to find your Bluebird day?
            </p>
          </div>

          <button
            onClick={onDismiss}
            className={BUTTON_PRIMARY}
          >
            Search now
          </button>
        </div>
      </div>
    </div>
  )
}
