import PageShell from './PageShell'
import { RADIUS } from '../styles'

// Served by Starlette for any static path that doesn't resolve. Before this,
// a mistyped URL returned the raw JSON body of an HTTP exception, which reads
// as a broken site rather than a wrong address.
//
// Paths under /api keep returning JSON from the catch-all router, which is
// correct: a client that asked for JSON should not have to parse a page.
//
// Nothing here explains the miss. A 404 cannot tell a typo from a dead link
// from a path that never existed, so any explanation is a guess, and the ones
// this page used to offer sent people somewhere they hadn't asked to go.
export default function NotFoundPage() {
  return (
    <PageShell title="404" subtitle="Page not found">
      {/* The src has to be absolute. 404.html is served at whatever URL missed
          rather than at /404.html, so on a miss at /a/b/c a relative path would
          resolve against /a/b/ and the image would 404 as well.

          Decorative alt: the heading already says the only thing the picture
          says, and announcing it twice helps nobody. */}
      <img
        src="/not-found.webp"
        alt=""
        width={1440}
        height={720}
        className={`w-full h-auto ${RADIUS.control}`}
      />
    </PageShell>
  )
}
