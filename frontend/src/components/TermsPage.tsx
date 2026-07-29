import PageShell, { Section } from './PageShell'
import ContactBody from './ContactBody'
import DataSourceList from './DataSourceList'
import SafetyNotice from './SafetyNotice'
import { LINK, PROSE } from '../styles'
import { SUPPORT_EMAIL } from '../utils/contact'

// The public terms of use, on their own URL because that is how they get
// asked for: app stores, payment processors and data providers want a privacy
// link and a terms link, not one page that covers both and a footer label that
// quietly points somewhere else.
//
// The safety notice is the same component the welcome dialog renders. It
// belongs here as well as there for the reason it is shared at all: the dialog
// is dismissed once and remembered forever, so the people with the most
// Bluebird trips behind them are the least likely to have seen it recently.
export default function TermsPage() {
  return (
    <PageShell title="Terms" subtitle="The terms of using Bluebird Forecast">
      <p className={PROSE.body}>
        Bluebird Forecast is a free tool for finding good weather windows in the mountains.
        Using it means accepting what is on this page.
      </p>

      <Section id="license" title="License">
        <p className={PROSE.body}>
          Bluebird is free to use. Its source is public but it is not open source: it is
          licensed under the{' '}
          <a
            href="https://polyformproject.org/licenses/noncommercial/1.0.0"
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            PolyForm Noncommercial License 1.0.0
          </a>
          . You may read, modify, self-host, and share it for any noncommercial purpose.
          Commercial use of any kind needs a separate license: email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
            {SUPPORT_EMAIL}
          </a>{' '}
          to arrange one.
        </p>
      </Section>

      <Section id="warranty" title="No warranty">
        <p className={PROSE.body}>
          Bluebird comes with no warranty of any kind. Forecasts are automated estimates from
          third-party models, the destination data is community-maintained, and neither is
          reviewed by a human before you see it. Use Bluebird to plan, not to decide.
        </p>
      </Section>

      <Section id="availability" title="Availability and fair use">
        <div className={`${PROSE.body} space-y-3`}>
          <p>
            There is no uptime commitment. Bluebird runs on the free tiers of services that
            are themselves free, so requests are rate limited per client and the site can be
            slow or unavailable when a provider it depends on is. Automated bulk use gets
            limited before a person's request does.
          </p>
          <p>
            The{' '}
            <a href="/docs" className={LINK}>
              HTTP API
            </a>{' '}
            is open and needs no key. In return, please keep your usage in proportion to what
            someone could reasonably do by hand, and cache what you fetch.
          </p>
        </div>
      </Section>

      <Section id="safety" title="Safety">
        <p className={PROSE.body}>
          <SafetyNotice />
        </p>
      </Section>

      <Section id="data" title="Data licenses">
        <p className={`${PROSE.body} mb-3`}>
          Bluebird produces none of this data. It queries these providers, ranks what comes
          back, and shows you the result. Each provider's own license governs its data, and
          those terms reach you along with it.
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
