import PageShell from './PageShell'
import { LINK, PROSE } from '../styles'
import { SUPPORT_EMAIL } from '../utils/contact'

// Served by Starlette for any static path that doesn't resolve. Before this,
// a mistyped URL returned the raw JSON body of an HTTP exception, which reads
// as a broken site rather than a wrong address.
//
// Paths under /api keep returning JSON from the catch-all router, which is
// correct: a client that asked for JSON should not have to parse a page.
export default function NotFoundPage() {
  return (
    <PageShell title="Page not found" subtitle="There is nothing at this address">
      <div className={`${PROSE.body} space-y-3`}>
        <p>
          The link may be out of date, or the address may have a typo in it. Nothing is
          broken on your end.
        </p>
        <p>
          The map is at{' '}
          <a href="/" className={LINK}>
            bluebirdforecast.com
          </a>
          , and the privacy and terms are at{' '}
          <a href="/privacy" className={LINK}>
            /privacy
          </a>
          .
        </p>
        <p>
          If you got here from a link on the site itself, that is a bug worth telling us
          about:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </PageShell>
  )
}
