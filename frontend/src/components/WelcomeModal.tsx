import { useDialog } from '../hooks/useDialog'

interface Props {
  onDismiss: () => void
}

const STEPS: [string, string][] = [
  ['Destinations', 'Choose where to search by drawing an area on the map, searching by name, or providing custom coordinates.'],
  ['Forecast Window', 'Select the start and end date for the weather period you care about.'],
  ['Result Ranking', 'Choose how destinations should be ranked: driest conditions, lowest winds, ideal temperatures, or cleanest air.'],
  ['Options', 'Apply constraints and enable additional features like wildfire visibility.'],
  ['Analyze', 'Generate ranked results, explore them on the map, and compare forecast data across your selected destinations.'],
  ['Repeat', 'Adjust your search area, forecast window, ranking, or options at any time to find a better window.'],
]

export default function WelcomeModal({ onDismiss }: Props) {
  const panelRef = useDialog(onDismiss)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700">
          <img src="/icon.png" alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          <div>
            <h1 id="welcome-title" className="text-xl font-bold text-white leading-tight">Welcome to Bluebird Forecast</h1>
            <p className="text-sm text-slate-400">The Weather Window Finder</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-slate-300 mb-3">
            It's Friday evening. Rain is moving in from the west, smoke is drifting from the east,
            and strong winds are building to the south. You want to climb this weekend, but where
            should you go?
          </p>
          <p className="text-sm text-slate-300 mb-4">
            Bluebird helps you find out. Draw a search area and discover the best peaks, trails,
            lakes, and other destinations for your next adventure. Bluebird analyzes upcoming
            weather and ranks destinations by precipitation, wind, temperature, and air quality so
            you can quickly find the best objective.
          </p>

          <h2 className="text-sm font-semibold text-white mb-3">How it works</h2>

          {/* Steps */}
          <ol className="space-y-3 mb-5">
            {STEPS.map(([title, desc], i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-slate-300 leading-snug">
                  <span className="text-white font-semibold">{title}</span>
                  {': '}
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          {/* The one sentence the lawyers asked for: people plan real
              backcountry trips with this data, so the app itself must say it
              is not a safety tool — the README saying so isn't user-visible. */}
          <p className="text-xs text-slate-500 mb-4">
            Bluebird is a planning aid, not a safety tool. Forecasts are automated estimates.
            Verify conditions with official sources such as{' '}
            <a
              href="https://www.weather.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-300"
            >
              weather.gov
            </a>{' '}
            before committing to backcountry travel.
          </p>

          <div className="border-t border-slate-700 pt-4 mb-4">
            <p className="text-sm text-slate-200 font-medium text-center">
              Ready to find your Bluebird day?
            </p>
          </div>

          <button
            onClick={onDismiss}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Search Now
          </button>
        </div>
      </div>
    </div>
  )
}
