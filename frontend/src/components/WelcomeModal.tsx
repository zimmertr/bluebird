interface Props {
  onDismiss: () => void
}

const STEPS: [string, string][] = [
  ['Destinations', 'Discovering destinations can be accomplished using three input criteria — Search by Name, Search by Polygon, and Search by Coordinates.'],
  ['Forecast Window', 'Specify the start and end date for the period of time you care about.'],
  ['Result Ranking', 'Specify the way in which you want to rank the destinations after performing an analysis.'],
  ['Options', 'Apply constraints for your search and enable additional features.'],
  ['Analyze', 'Construct a list of results and tabulate the forecast data. Select the destination checkboxes to chart the data across your forecast window.'],
  ['Repeat', 'Adjust your destinations, forecast window, result ranking, or options and re-analyze to update the data at any time.'],
]

export default function WelcomeModal({ onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700">
          <img src="/icon.png" alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Welcome to Bluebird Forecast</h1>
            <p className="text-sm text-slate-400">The Weather Window Finder</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-slate-300 mb-4">
            It's Friday evening and there's rain blowing in from the west, a fire burning in the
            east, and a wind squall forming to the south. You'd like to climb a mountain this
            weekend. Let's work together to find and identify the best weather window and
            objectives!
          </p>

          {/* Steps */}
          <ol className="space-y-3 mb-5">
            {STEPS.map(([title, desc], i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-slate-300 leading-snug">
                  <span className="text-white font-semibold">{title}</span>
                  {' — '}
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          <button
            onClick={onDismiss}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Analyze Now
          </button>
        </div>
      </div>
    </div>
  )
}
