import { ReactNode } from 'react'
import PageShell from './PageShell'
import PrivacyBody from './PrivacyBody'
import SafetyNotice from './SafetyNotice'
import { LINK, PROSE } from '../styles'
import { DATA_SOURCES } from '../utils/dataSources'
import { ISSUES_URL, SECURITY_URL, SUPPORT_EMAIL } from '../utils/contact'

// The public, linkable version of everything the app says about itself. The
// dialog in the app answers "what happens to my data" for someone already
// using Bluebird; this is the address you can paste into an email, hand to a
// data provider, or put in a form that asks for a privacy policy.
//
// The privacy and safety sections are the same components the app renders, not
// a second copy of the wording. That is the whole point: a page that quietly
// disagrees with the app is worse than no page.

// Sections are anchored so /privacy#contact lands somewhere useful when this
// gets linked from an issue or a reply.
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-6 pt-6 border-t border-slate-700">
      <h2 className={`${PROSE.heading} mb-3`}>{title}</h2>
      {children}
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <PageShell
      title="Privacy and terms"
      subtitle="What Bluebird does with your data, and the terms of using it"
    >
      <p className={PROSE.body}>
        Bluebird Forecast is a free tool for finding good weather windows in the mountains.
        This page is the full version of the privacy note shown in the app,
        plus the terms of use, where the data comes from, and how to get in touch.
      </p>

      <Section id="privacy" title="Privacy">
        <PrivacyBody />
      </Section>

      <Section id="safety" title="Safety">
        <p className={PROSE.body}>
          <SafetyNotice />
        </p>
      </Section>

      <Section id="terms" title="Terms">
        <div className={`${PROSE.body} space-y-3`}>
          <p>
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
          <p>
            It comes with no warranty of any kind. Forecasts are automated estimates from
            third-party models, the destination data is community-maintained, and neither is
            reviewed by a human before you see it. Use Bluebird to plan, not to decide.
          </p>
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

      <Section id="data" title="Data sources">
        <p className={`${PROSE.body} mb-3`}>
          Bluebird produces none of this data. It queries these providers, ranks what comes
          back, and shows you the result. Each provider's own license and privacy policy
          governs its data.
        </p>
        <ul className={`${PROSE.body} space-y-2`}>
          {DATA_SOURCES.map((source) => (
            <li key={source.name}>
              <a href={source.href} target="_blank" rel="noreferrer" className={LINK}>
                {source.name}
              </a>
              {source.license ? ` (${source.license})` : ''}. {source.provides}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="contact" title="Contact">
        <div className={`${PROSE.body} space-y-3`}>
          <p>
            Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
              {SUPPORT_EMAIL}
            </a>{' '}
            about anything: a summit at the wrong elevation, a destination that should be
            listed and isn't, a privacy question, or a page that will not load. No account
            needed.
          </p>
          <p>
            Bugs and feature requests are tracked on{' '}
            <a href={ISSUES_URL} target="_blank" rel="noreferrer" className={LINK}>
              GitHub
            </a>
            , which is the better channel if you can describe how to reproduce something.
          </p>
          <p>
            Security vulnerabilities should go through{' '}
            <a href={SECURITY_URL} target="_blank" rel="noreferrer" className={LINK}>
              GitHub's private advisory form
            </a>{' '}
            rather than a public issue.
          </p>
        </div>
      </Section>

      <p className={`${PROSE.note} mt-6`}>Last updated 28 July 2026.</p>
    </PageShell>
  )
}
