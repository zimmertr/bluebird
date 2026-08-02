import { useDialog } from '../hooks/useDialog'
import SafetyNotice from './SafetyNotice'
import { ACCENT, BUTTON_PRIMARY, LAYER, PROSE, RADIUS, SURFACE_CARD } from '../styles'

interface Props {
  onDismiss: () => void
}

const STEPS: [string, string][] = [
  ['Destinations', 'Choose what destinations to analyze by clicking on the map, searching by name, drawing a polygon, or providing custom coordinates.'],
  ['Forecast', 'Choose a weather model, then pick a day on the calendar, drag across days for a range, or analyze the current hour.'],
  ['Ranking', 'Choose how destinations should be ranked: driest conditions, lowest winds, ideal temperatures, or cleanest air.'],
  ['Options', 'Apply constraints and enable additional features like wildfire visibility.'],
  ['Analyze', 'Generate ranked results, explore them on the map, and compare forecast data across your selected destinations.'],
  ['Repeat', 'Adjust your search area, forecast window, ranking, or options at any time to find a better window.'],
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
          <p className={`${PROSE.body} mb-3`}>
            It's Friday evening. Rain is moving in from the west, smoke is drifting from the east,
            and strong winds are building to the south. You want to get outside this weekend, but
            where should you go?
          </p>
          <p className={`${PROSE.body} mb-4`}>
            Bluebird helps you find out. Draw a search area and discover the best peaks, trails,
            lakes, and other destinations for your next adventure. Bluebird analyzes upcoming
            weather and ranks destinations by precipitation, wind, temperature, and air quality so
            you can quickly find the best objective.
          </p>

          <h2 className={`${PROSE.heading} mb-3`}>How it works</h2>

          {/* Steps */}
          <ol className="space-y-3 mb-5">
            {STEPS.map(([title, desc], i) => (
              <li key={i} className={`${PROSE.body} flex gap-3`}>
                <span className={`flex-shrink-0 w-5 h-5 ${RADIUS.pill} ${ACCENT.fill} text-xs font-bold flex items-center justify-center mt-0.5`}>
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
            Search Now
          </button>
        </div>
      </div>
    </div>
  )
}
