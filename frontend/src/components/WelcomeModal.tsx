interface Props {
  onDismiss: () => void
}

const STEPS: [string, string][] = [
  ['Draw a search area', 'Click on the map to place polygon vertices. Three or more points form the search boundary.'],
  ['Choose a destination type', 'Peaks are live now. Trailheads and lakes are coming soon.'],
  ['Set a forecast window', 'Pick the start and end date/time for the weather period you care about.'],
  ['Sort & filter', 'Rank by least rain, least wind, or coldest temperature. Optionally filter by elevation range.'],
  ['Analyze', 'Results appear on the map as colored markers and in the table below, ranked best to worst.'],
]

export default function WelcomeModal({ onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700">
          <img src="/icon.png" alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Welcome to Bluebird</h1>
            <p className="text-sm text-slate-400">Weather Window Finder</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-slate-300 mb-4">
            Find peaks and destinations inside a drawn area with the best upcoming weather — ranked by
            precipitation, wind, or temperature.
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

          {/* Tips */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 mb-5 space-y-1">
            <p className="text-xs text-slate-400">
              <span className="text-slate-300 font-medium">Tip:</span> Drag any vertex to reposition it.
            </p>
            <p className="text-xs text-slate-400">
              <span className="text-slate-300 font-medium">Tip:</span> Drag the midpoint between two vertices to insert a new point there.
            </p>
            <p className="text-xs text-slate-400">
              <span className="text-slate-300 font-medium">Tip:</span> Click an existing vertex to remove it.
            </p>
          </div>

          <button
            onClick={onDismiss}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Let's go
          </button>
        </div>
      </div>
    </div>
  )
}
