interface Props {
  onClose: () => void
}

// Bluebird collects nothing and stores nothing about you, but it does ask for
// your location and fans requests out to several third-party APIs. This spells
// that out plainly so the behavior is never a surprise. Keep it honest: if the
// app's data flow changes, this copy has to change with it.
export default function PrivacyModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700 flex-shrink-0">
          <img src="/icon.png" alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Privacy</h1>
            <p className="text-sm text-slate-400">What Bluebird does and doesn't do with your data</p>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <p className="text-sm text-slate-300 mb-4">
            Bluebird has no accounts, no sign-in, and no tracking. There are no analytics scripts, no
            advertising, and no cookies used to follow you.
          </p>

          <ul className="space-y-3 text-sm text-slate-300 mb-4">
            <li>
              <span className="text-white font-semibold">Your location</span> is only requested to
              center the map when you first open the app. If you allow it, it stays in your browser
              and is never sent to the Bluebird server.
            </li>
            <li>
              <span className="text-white font-semibold">Your searches</span> (the area you draw and
              the dates you pick) are sent to the Bluebird server to fetch forecasts, and to the
              data providers below to look up destinations, weather, maps, and fires. As with any web
              request, those providers can see your IP address.
            </li>
            <li>
              <span className="text-white font-semibold">Nothing is stored about you.</span> Searches
              aren't saved to a database or tied to your identity. Server logs are short-lived and
              used only for debugging.
            </li>
            <li>
              <span className="text-white font-semibold">On your device</span>, the only thing saved
              is a small flag remembering that you dismissed the welcome dialog.
            </li>
          </ul>

          <p className="text-xs text-slate-500 mb-5">
            Data providers:{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-400 underline"
            >
              OpenStreetMap
            </a>
            ,{' '}
            <a
              href="https://open-meteo.com"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-400 underline"
            >
              Open-Meteo
            </a>
            ,{' '}
            <a
              href="https://atmosphere.copernicus.eu"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-400 underline"
            >
              CAMS
            </a>
            ,{' '}
            <a
              href="https://openfreemap.org"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-400 underline"
            >
              OpenFreeMap
            </a>
            ,{' '}
            <a
              href="https://nominatim.org"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-400 underline"
            >
              Nominatim
            </a>
            , and{' '}
            <a
              href="https://www.nifc.gov"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-sky-400 underline"
            >
              NIFC
            </a>
            . Each has its own privacy policy.
          </p>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg transition-colors text-sm flex-shrink-0"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
