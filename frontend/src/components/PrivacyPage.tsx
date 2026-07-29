import PageShell, { Section } from './PageShell'
import ContactBody from './ContactBody'
import DataSourceList from './DataSourceList'
import { PROSE } from '../styles'

// The public privacy policy: the address you can paste into an email, hand to
// a data provider, or put in a form that asks for one. Terms live at /terms,
// because the systems that ask for these ask for them separately.
//
// Keep this copy honest. It is a promise to users, not documentation, and it
// goes stale from behavior changes made in files nobody thinks to connect to
// it: #169 added rate limiting keyed on client address, which quietly
// falsified "logs are used only for debugging" until it was rewritten here.
// Anything that changes what Bluebird does with a request changes this file
// too, and legal.test.ts pins the claims that have already been wrong once.
export default function PrivacyPage() {
  return (
    <PageShell title="Privacy" subtitle="What Bluebird does with your data">
      <div className="space-y-4">
        <p className={PROSE.body}>
          Bluebird is free to use. There are no ads, no paid tiers, and nothing to sign up for.
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
      </div>

      <Section id="data" title="Where your requests go">
        <p className={`${PROSE.body} mb-3`}>
          Bluebird produces none of this data. It queries these providers, ranks what comes
          back, and shows you the result. Each has its own privacy policy and license, and
          each can see your address the way any web request lets a server see it.
        </p>
        <DataSourceList />
      </Section>

      <Section id="contact" title="Contact">
        <ContactBody />
      </Section>

      <p className={`${PROSE.note} mt-6`}>Last updated 28 July 2026.</p>
    </PageShell>
  )
}
