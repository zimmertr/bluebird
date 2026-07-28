import { useDialog } from '../hooks/useDialog'
import { BUTTON_PRIMARY, LINK, PROSE, RADIUS, SURFACE_CARD } from '../styles'

interface Props {
  onClose: () => void
}

// Bluebird collects nothing and stores nothing about you, but it does ask for
// your location and fans requests out to several third-party APIs. This spells
// that out plainly so the behavior is never a surprise. Keep it honest: if the
// app's data flow changes, this copy has to change with it.
export default function PrivacyModal({ onClose }: Props) {
  const panelRef = useDialog(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        tabIndex={-1}
        className={`${SURFACE_CARD} w-full max-w-md max-h-[85vh] flex flex-col focus:outline-none`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-700 flex-shrink-0">
          <img src="/icon.png" alt="" className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`} />
          <div>
            <h1 id="privacy-title" className={PROSE.title}>Privacy</h1>
            <p className={PROSE.subtitle}>What Bluebird does and doesn't do with your data</p>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <p className={`${PROSE.body} mb-4`}>
            Bluebird is a free, non-commercial project. No ads, no paid tiers, no monetization.
            It has no accounts, no sign-in, and no tracking. There are no analytics scripts, no
            advertising, and no cookies used to follow you.
          </p>

          <ul className={`${PROSE.body} space-y-3 mb-4`}>
            <li>
              <span className={PROSE.strong}>Your location</span> is only requested to
              center the map when you first open the app. If you allow it, it stays in your browser
              and is never sent to the Bluebird server.
            </li>
            <li>
              <span className={PROSE.strong}>Your searches</span> (the area you draw and
              the dates you pick) are sent to the Bluebird server to fetch forecasts, and to the
              data providers below to look up destinations, weather, maps, and fires. As with any web
              request, those providers can see your IP address.
            </li>
            <li>
              <span className={PROSE.strong}>Nothing is stored about you.</span> Searches
              aren't saved to a database or tied to your identity. Server logs (which include your
              IP address) are used only for debugging and are discarded by routine log rotation,
              typically within days. They are never archived or shared.
            </li>
            <li>
              <span className={PROSE.strong}>On your device</span>, the only thing saved
              is a small flag remembering that you dismissed the welcome dialog.
            </li>
          </ul>

          <p className={`${PROSE.note} mb-5`}>
            Data providers:{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              OpenStreetMap
            </a>
            ,{' '}
            <a
              href="https://open-meteo.com"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              Open-Meteo
            </a>
            ,{' '}
            <a
              href="https://atmosphere.copernicus.eu"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              CAMS
            </a>
            ,{' '}
            <a
              href="https://openfreemap.org"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              OpenFreeMap
            </a>
            ,{' '}
            <a
              href="https://nominatim.org"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              Nominatim
            </a>
            , and{' '}
            <a
              href="https://www.nifc.gov"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              NIFC
            </a>
            . Each has its own privacy policy.
          </p>

          <button
            onClick={onClose}
            className={`${BUTTON_PRIMARY} flex-shrink-0`}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
