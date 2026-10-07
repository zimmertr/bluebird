import PageShell, { Section } from './PageShell'
import ContactBody from './ContactBody'
import DataSourceList from './DataSourceList'
import { LINK, PROSE } from '../styles'

// The public privacy policy: the address you can paste into an email, hand to
// a data provider, or put in a form that asks for one. Terms live at /terms,
// because the systems that ask for these ask for them separately.
//
// Keep this copy honest. It is a promise to users, not documentation, and it
// goes stale from behavior changes made in files nobody thinks to connect to
// it: #169 added rate limiting keyed on client address, which quietly
// falsified "logs are used only for debugging" until it was rewritten here.
// Anything that changes what Bluebird Forecast does with a request changes this file
// too, and legal.test.ts reads each claim here against the code that makes it
// true, so the change that falsifies one fails there.
export default function PrivacyPage() {
  return (
    <PageShell heading="Privacy" subtitle="What Bluebird Forecast does with your data">
      <div className="space-y-4">
        <p className={PROSE.body}>
          Bluebird Forecast is free to use. There are no ads, no paid tiers, and nothing to sign up for.
          It has no accounts, no sign-in, and no tracking. There are no analytics scripts, no
          advertising, and no cookies used to follow you.
        </p>

        <ul className={`${PROSE.body} space-y-3`}>
          <li>
            <span className={PROSE.strong}>Your location</span> is only requested when you
            press the locate button on the map, and your browser asks you first. The map then
            centers on where you are, and the page's address records that view, which places you
            to within about 10 meters. Your location then travels with the address, as the next
            two points describe, until you move the map somewhere else.
          </li>
          <li>
            <span className={PROSE.strong}>Your searches</span> go to the Bluebird Forecast
            server so it can find destinations. When you press Analyze, it receives the area you
            draw, the kinds of destination you pick, and the coordinates of any place you paste,
            search for or click on the map, and it checks each destination for nearby fires and
            closures. A coordinate you paste or click is looked up as soon as it is in the box:
            your browser reads the map tiles around it from OpenFreeMap, and sends the server any
            it could not place. Destination searches are answered by public OpenStreetMap
            servers: one run by FOSSGIS in Germany and, when it is unavailable, one run by VK
            (maps.mail.ru). A place name you type in the search box goes to the server too, which
            looks it up with Nominatim. The fire and closure layers send the server the area on
            screen.
          </li>
          <li>
            <span className={PROSE.strong}>The page's address</span> holds what is on screen:
            the area, the dates, the places you added and the map view. Your browser sends that
            address to the Bluebird Forecast server when you load the page and with each request
            the page makes to it, and a link you share carries all of it.
          </li>
          <li>
            <span className={PROSE.strong}>Forecasts</span> come to your browser directly from
            Open-Meteo, and the map, the rain radar and the snow layer come directly from their
            providers, so those requests carry your IP address, not the server's. If your browser
            cannot reach Open-Meteo, the analysis stops there, and the server does not fetch
            forecasts for you.
          </li>
          <li>
            <span className={PROSE.strong}>Nothing is stored about you.</span> Searches
            aren't saved to a database or tied to your identity. Server logs record your IP
            address with each request to the server's API, and the place names you search for,
            but not the page's address or anything else you enter. They are kept only for
            debugging and are deleted when the server is next updated, typically within days.
            They are never archived or shared. Your address is also counted in memory to apply rate
            limits, which is what keeps the free data providers available to everyone; those
            counters expire on their own and are gone whenever the server restarts.
          </li>
          <li>
            <span className={PROSE.strong}>On your device</span>, Bluebird Forecast saves four
            things and sends none of them anywhere. Your browser's local storage keeps whether you
            dismissed the welcome dialog and how you laid out the results: which views are open,
            which columns show, and in what order. Session storage, which ends when you close the
            tab, keeps the forecasts fetched in the last 15 minutes so a reload does not fetch them
            again, and the version of the app that last reloaded itself after an update.
          </li>
          <li>
            <span className={PROSE.strong}>Cloudflare</span> carries every request between your
            browser and the Bluebird Forecast server. It sees your IP address and the full address
            of each request, applies a rate limit of its own, and asks your browser to report
            connections to the site that fail. Its own{' '}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              privacy policy
            </a>{' '}
            covers what it keeps.
          </li>
        </ul>
      </div>

      <Section id="data" heading="Where your requests go">
        <p className={`${PROSE.body} mb-3`}>
          Bluebird Forecast produces none of this data. It queries these providers, ranks what comes
          back, and shows you the result. Each has its own privacy policy and license. Your
          browser contacts Open-Meteo, OpenFreeMap, the Iowa Environmental Mesonet and NOAA
          NOHRSC itself, so they can see your IP address the way any web request lets a server
          see it. The others are reached through the Bluebird Forecast server or through
          Open-Meteo, and see that address instead of yours.
        </p>
        <DataSourceList />
      </Section>

      <Section id="contact" heading="Contact">
        <ContactBody />
      </Section>

      <p className={`${PROSE.note} mt-6`}>Last updated 7 October 2026.</p>
    </PageShell>
  )
}
