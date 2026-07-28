import { Fragment } from 'react'
import { LINK, PROSE } from '../styles'
import { DATA_SOURCES } from '../utils/dataSources'

// The privacy copy itself, rendered both by the dialog in the app and by the
// public page at /privacy. It lives here rather than in either of them so the
// two cannot drift: a shared link is only worth having if it says the same
// thing the app does.
//
// Keep it honest. This is a promise to users, not documentation, and it goes
// stale from behavior changes made elsewhere: #169 added rate limiting keyed
// on client address, which quietly falsified "used only for debugging" until
// this rewrite. Anything that changes what Bluebird does with a request has to
// change this file too, and legal.test.ts pins the claims that have already
// been wrong once.
export default function PrivacyBody() {
  return (
    <div className="space-y-4">
      <p className={PROSE.body}>
        Bluebird is a free, non-commercial project. No ads, no paid tiers, no monetization.
        It has no accounts, no sign-in, and no tracking. There are no analytics scripts, no
        advertising, and no cookies used to follow you.
      </p>

      <ul className={`${PROSE.body} space-y-3`}>
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
          IP address) are kept only for debugging and are discarded by routine log rotation,
          typically within days. They are never archived or shared. Your address is also counted
          in memory to apply rate limits, which is what keeps the free data providers available
          to everyone; those counters expire on their own and are gone whenever the server
          restarts.
        </li>
        <li>
          <span className={PROSE.strong}>On your device</span>, the only thing saved
          is a small flag remembering that you dismissed the welcome dialog.
        </li>
      </ul>

      <p className={PROSE.note}>
        Data providers:{' '}
        {DATA_SOURCES.map((source, i) => (
          <Fragment key={source.name}>
            {i > 0 && (i === DATA_SOURCES.length - 1 ? ', and ' : ', ')}
            <a href={source.href} target="_blank" rel="noreferrer" className={LINK}>
              {source.name}
            </a>
          </Fragment>
        ))}
        . Each has its own privacy policy.
      </p>
    </div>
  )
}
